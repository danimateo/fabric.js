(function () {
  var _proto = fabric.util.object.clone(fabric.StaticCanvas.prototype);
  fabric.util.object.extend(fabric.StaticCanvas.prototype, {
    get: function (key) {
      var drawableKey = key;
      switch (key) {
        case "backgroundImage":
          return this[drawableKey] && this[drawableKey].isType('group') ?
            this[drawableKey].getObjects('image')[0] :
            _proto.get.call(this, key);
        case "backgroundColor":
          drawableKey = "backgroundImage";
          return this[drawableKey] && this[drawableKey].isType('group') ?
            this[drawableKey].getObjects('rect')[0] :
            _proto.get.call(this, key);
        case "overlayImage":
          return this[drawableKey] && this[drawableKey].isType('group') ?
            this[drawableKey].getObjects('image')[0] :
            _proto.get.call(this, key);
        case "overlayColor":
          drawableKey = "overlayImage";
          return this[drawableKey] && this[drawableKey].isType('group') ?
            this[drawableKey].getObjects('rect')[0] :
            _proto.get.call(this, key);
        default:
          return _proto.get.call(this, key);
      }
    },

    _shouldRenderOverlay: true,

    _renderOverlay: function (ctx) {
      if (this._shouldRenderOverlay) _proto._renderOverlay.call(this, ctx);
    }
  });

  /**
   * EraserBrush class
   * See {@link fabric.EraserBrush#onMouseDown}
   * Supports selective erasing meaning that only erasable objects are affected by the eraser brush.
   * In order to support selective erasing all non erasable objects are rendered on the main ctx using a clone of the main canvas
   * while the entire canvas is rendered on the top ctx.
   * When erasing occurs, the path clips the top ctx and reveals the bottom ctx.
   * This achieves the desired effect of seeming to erase only erasable objects.
   * @class fabric.EraserBrush
   * @extends fabric.PencilBrush
   */
  fabric.EraserBrush = fabric.util.createClass(
    fabric.PencilBrush,
    /** @lends fabric.EraserBrush.prototype */ {
      type: "eraser",

      /**
       * @private
       */
      _hasOverlay: false,

      /**
       * @private
       * @param {Function} callback 
       * @returns 
       */
      forCanvasDrawables: function (callback) {
        var _this = this;
        callback.call(_this, 'background', 'backgroundImage', 'setBackgroundImage', 'backgroundColor', 'setBackgroundColor');
        callback.call(_this, 'overlay', 'overlayImage', 'setOverlayImage', 'overlayColor', 'setOverlayColor');
      },

      /**
       * We group background/overlay image and color and assign the group to the canvas' image property
       * @param {fabric.Canvas} canvas
       */
      prepareCanvas: function (canvas) {
        this.forCanvasDrawables(
          function (drawable, imgProp, imgSetter, colorProp, colorSetter) {
            var image = canvas[imgProp], color = canvas[colorProp];
            if (image && image.isType('group')) {
              color = image._objects[0];
              image = image._objects[1];
            } else {
              var mergedGroup = new fabric.Group([], {
                width: canvas.width,
                height: canvas.height,
                erasable: false
              });
              if (image) {
                mergedGroup.addWithUpdate(image);
                mergedGroup._image = image;
              }
              if (color) {
                color = new fabric.Rect({
                  width: canvas.width,
                  height: canvas.height,
                  fill: color,
                  erasable: typeof color === 'object' && color.erasable
                });
                mergedGroup.addWithUpdate(color);
                mergedGroup._color = color;
              }
              canvas[imgSetter](mergedGroup);
              canvas[colorSetter](null);
            }
          });
      },

      /**
       * Perpare canvas for drawing
       * @param {fabric.Canvas} source 
       * @param {fabric.Canvas} target
       */
      prepareCanvasForDrawing: function (source, target) {
        this._hasOverlay = false;
        this.forCanvasDrawables(
          function (drawable, imgProp, _, colorProp) {
            var sourceImage = source.get(imgProp);
            var sourceColor = source.get(colorProp);
            var targetImage = target.get(imgProp);
            var targetColor = target.get(colorProp);
            if (sourceImage && sourceImage.erasable) {
              targetImage.set({ opacity: 0 });
            } else if (sourceImage) {
              if (drawable === 'overlay') {
                // we need to draw on top of the eraser
                this._hasOverlay = true;
                targetImage.set({ opacity: 0 });
              } else {
                sourceImage._originalOpacity = sourceImage.opacity;
                sourceImage.set({ opacity: 0 });
              }
            }
            if (sourceColor && sourceColor.erasable) {
              targetColor.set({ opacity: 0 });
            } else if (sourceColor) {
              if (drawable === 'overlay') {
                // we need to draw on top of the eraser
                this._hasOverlay = true;
                targetColor.set({ opacity: 0 });
              } else {
                sourceColor._originalOpacity = sourceColor.opacity;
                sourceColor.set({ opacity: 0 });
              }
            }
          });
      },

      /**
       * @extends @class fabric.BaseBrush
       * @param {CanvasRenderingContext2D} ctx
       */
      _saveAndTransform: function (ctx) {
        this.callSuper("_saveAndTransform", ctx);
        ctx.globalCompositeOperation = "destination-out";
      },

      needsFullRender: function () {
        return this.callSuper("needsFullRender") || this._hasOverlay;
      },

      /**
       * 
       * @param {fabric.Point} pointer
       * @param {fabric.IEvent} options
       * @returns
       */
      onMouseDown: function (pointer, options) {
        if (!this.canvas._isMainEvent(options.e)) {
          return;
        }
        this._prepareForDrawing(pointer);

        var _this = this;
        this.prepareCanvas(this.canvas);
        this.canvas.clone(function (c) {
          _this._prepareForRendering(c);
        });
      },

      /**
       * @private
       * Prepare bottom ctx
       * Use a clone of the main canvas to render the non-erasable objects on the bottom context
       */
      _prepareForRendering: function (_canvas) {
        var canvas = this.canvas;
        this.prepareCanvasForDrawing(canvas, _canvas);
        _canvas.renderCanvas(
          canvas.getContext(),
          canvas.getObjects().filter(function (obj) {
            return !obj.erasable;
          })
        );
        this._render();
        _canvas.dispose();
      },

      _render: function () {
        this.canvas._shouldRenderOverlay = false;
        this.canvas.renderCanvas(
          this.canvas.contextTop,
          this.canvas.getObjects()
        );
        this.callSuper("_render");
        if (this._hasOverlay) {
          this.canvas._shouldRenderOverlay = true;
          var ctx = this.canvas.contextTop;
          this._saveAndTransform(ctx);
          this.canvas._renderOverlay(ctx);
          ctx.restore();
        }
        this.canvas._shouldRenderOverlay = true;
      },

      /**
       * Restore top and bottom ctx after _finalizeAndAddPath is invoked
       * @param {fabric.Point} pointer
       * @param {fabric.IEvent} options
       * @returns
       */
      onMouseUp: function (pointer, options) {
        var retVal = this.callSuper("onMouseUp", pointer, options);
        this.canvas.renderAll();
        return retVal;
      },

      /**
       * Adds path to existing clipPath of object
       * @private
       * @param {fabric.Object} obj
       * @param {fabric.Path} path
       */
      _addPathToObjectEraser: function (obj, path) {
        var clipObject;
        if (!obj.eraser) {
          clipObject = new fabric.EraserPath();
          clipObject.setParent(obj);
        } else {
          clipObject = obj.clipPath;
        }

        var transformMatrix = fabric.util.invertTransform(
          obj.calcTransformMatrix()
        );
        //fabric.util.applyTransformToObject(path, transformMatrix);
        clipObject.addPath(path, transformMatrix);

        obj.set({
          clipPath: clipObject,
          dirty: true,
          eraser: true
        });
      },

      /**
       * Finalize erasing by restoring canvas drawables to original state
       * @param {fabric.Canvas} source
       * @param {fabric.Canvas} path
       */
      applyEraserToCanvas: function (source, path) {
        this.forCanvasDrawables(
          function (drawable, imgProp, _, colorProp) {
            var sourceImage = source.get(imgProp);
            var sourceColor = source.get(colorProp);
            if (sourceImage && sourceImage.erasable) {
              this._addPathToObjectEraser(sourceImage, path);
            } else if (sourceImage && sourceImage._originalOpacity) {
              sourceImage.set({ opacity: sourceImage._originalOpacity });
              sourceImage._originalOpacity = undefined;
            }
            if (sourceColor && sourceColor.erasable) {
              this._addPathToObjectEraser(sourceColor, path);
            } else if (sourceColor && sourceColor._originalOpacity) {
              sourceColor.set({ opacity: sourceColor._originalOpacity });
              sourceColor._originalOpacity = undefined;
            }
          });
      },

      /**
       * On mouseup after drawing the path on contextTop canvas
       * we use the points captured to create an new fabric path object
       * and add it to every intersected erasable object.
       */
      _finalizeAndAddPath: function () {
        var ctx = this.canvas.contextTop, canvas = this.canvas;
        ctx.closePath();
        if (this.decimate) {
          this._points = this.decimatePoints(this._points, this.decimate);
        }
        var pathData = this._points && this._points.length > 1 ? this.convertPointsToSVGPath(this._points).join("") : "M 0 0 Q 0 0 0 0 L 0 0";
        if (pathData === "M 0 0 Q 0 0 0 0 L 0 0") {
          // do not create 0 width/height paths, as they are
          // rendered inconsistently across browsers
          // Firefox 4, for example, renders a dot,
          // whereas Chrome 10 renders nothing
          this.canvas.requestRenderAll();
          return;
        }

        var path = this.createPath(pathData);
        canvas.clearContext(canvas.contextTop);
        canvas.fire("before:path:created", { path: path });

        this.applyEraserToCanvas(canvas, path);
        var _this = this;
        canvas.forEachObject(function (obj) {
          if (obj.erasable && obj.intersectsWithObject(path)) {
            _this._addPathToObjectEraser(obj, path);
          }
        });
        canvas.requestRenderAll();
        path.setCoords();
        this._resetShadow();

        // fire event 'path' created
        canvas.fire("path:created", { path: path });
      }
    }
  );

  /**
   * Used by @class fabric.EraserBrush
   * Can be used regardless of @class fabric.EraserBrush to create an inverted clip path made of strokes (=unclosed paths)
   * It paints a rect and clips out the paths given to it so it can be used as a clip path for other objects
   * This makes it possible using unclosed paths for clipping, without this a clip path containing unclosed paths clips an object as if the path was closed and filled
   * 
   * @private
   * @class fabric.EraserPath
   * @extends fabric.Rect
   */
  fabric.EraserPath = fabric.util.createClass(fabric.Rect, fabric.Collection, {

    type: 'eraserPath',

    stateProperties: fabric.Object.prototype.stateProperties.concat('_objects'),

    cacheProperties: fabric.Object.prototype.cacheProperties.concat('_objects'),

    _objects: [],

    initialize: function (objects, options) {
      this.callSuper('initialize', Object.assign(options || {}, {
        originX: 'center',
        originY: 'center'
      }));
      this._objects = objects || [];
      this._objects.forEach(function (p) {
        p.path.set({ globalCompositeOperation: "destination-out" });
      })
    },

    setParent: function (parent) {
      this.set({
        width: parent.width,
        height: parent.height,
        clipPath: parent.clipPath
      });
    },

    _render: function (ctx) {
      this.callSuper('_render', ctx);
      this._objects.forEach(function (o) {
        ctx.save();
        var m = o.transformMatrix;
        m && ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        o.path.render(ctx);
        ctx.restore();
      })
    },

    addPath: function (path, transformMatrix) {
      path.set({ globalCompositeOperation: "destination-out" });
      this._objects.push({ path: path, transformMatrix: transformMatrix });
      this.dirty = true;
    },

    toObject: function (propertiesToInclude) {
      var _includeDefaultValues = this.includeDefaultValues;
      var objsToObject = this._objects.map(function (o) {
        var obj = o.path, transformMatrix = o.transformMatrix;
        var originalDefaults = obj.includeDefaultValues;
        obj.includeDefaultValues = _includeDefaultValues;
        var _obj = obj.toObject(propertiesToInclude);
        obj.includeDefaultValues = originalDefaults;
        return { path: _obj, transformMatrix: transformMatrix };
      });
      var obj = this.callSuper('toObject', propertiesToInclude);
      obj.objects = objsToObject;
      return obj;
    },
  });

  /**
     * Returns {@link fabric.EraserPath} instance from an object representation
     * @static
     * @memberOf fabric.EraserPath
     * @param {Object} object Object to create an instance from
     * @param {Function} [callback] Callback to invoke when an fabric.EraserPath instance is created
     */
  fabric.EraserPath.fromObject = function (object, callback) {
    var objects = object.objects,
      options = fabric.util.object.clone(object, true);
    delete options.objects;
    /*
    if (typeof objects === 'string') {
      // it has to be an url or something went wrong.
      fabric.loadSVGFromURL(objects, function (elements) {
        var group = fabric.util.groupSVGElements(elements, object, objects);
        group.set(options);
        callback && callback(group);
      });
      return;
    }
    */
    fabric.util.enlivenObjects(
      objects.map(function (p) {
        return p.path;
      }),
      function (enlivenedObjects) {
        fabric.util.enlivenObjects([object.clipPath], function (enlivedClipPath) {
          options.clipPath = enlivedClipPath[0];
          var _objects = objects.map(function (p, i) {
            return {
              path: enlivenedObjects[i],
              transformMatrix: p.transformMatrix
            };
          });
          callback && callback(new fabric.EraserPath(_objects, options));
        });
      }
    );
  };
})();
