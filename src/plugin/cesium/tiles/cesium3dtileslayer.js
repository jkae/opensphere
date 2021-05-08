goog.module('plugin.cesium.tiles.Layer');

const log = goog.require('goog.log');
const {transformExtent} = goog.require('ol.proj');
const dispatcher = goog.require('os.Dispatcher');
const MapEvent = goog.require('os.MapEvent');
const ActionEventType = goog.require('os.action.EventType');
const settings = goog.require('os.config.Settings');
const LayerEvent = goog.require('os.events.LayerEvent');
const LayerEventType = goog.require('os.events.LayerEventType');
const osMap = goog.require('os.map');
const {EPSG4326} = goog.require('os.proj');
const osStyle = goog.require('os.style');

const {
  CESIUM_ONLY_LAYER,
  promptForAccessToken,
  createIonAssetUrl,
  promptForWorldTerrain,
  SettingsKey,
  rectangleToExtent
} = goog.require('plugin.cesium');
const PrimitiveLayer = goog.require('plugin.cesium.PrimitiveLayer');
const {ICON, TYPE} = goog.require('plugin.cesium.tiles');
const {directiveTag: layerUITag} = goog.require('plugin.cesium.tiles.Cesium3DTileLayerUI');

const Logger = goog.requireType('goog.log.Logger');


/**
 * Logger
 * @type {Logger}
 */
const logger = log.getLogger('plugin.cesium.tiles.Layer');


/**
 * Cesium 3D tiles layer.
 */
class Layer extends PrimitiveLayer {
  /**
   * Constructor.
   */
  constructor() {
    super();

    /**
     * Cesium Ion asset id.
     * @type {number}
     * @protected
     */
    this.assetId = NaN;

    /**
     * Cesium Ion access token.
     * @type {string}
     * @protected
     */
    this.accessToken = '';

    /**
     * Error message for access token issues
     * @type {string}
     * @private
     */
    this.tokenError_ = '';

    /**
     * @type {Cesium.Resource|Object|string}
     * @protected
     */
    this.tileStyle = null;

    /**
     * @type {string}
     * @protected
     */
    this.url = '';

    /**
     * If Cesium World Terrain should be activated with this layer.
     * @type {boolean}
     * @protected
     */
    this.useWorldTerrain = false;

    this.setOSType(CESIUM_ONLY_LAYER);
    this.setIcons(ICON);
    this.setExplicitType(TYPE);
    this.setLayerUI(layerUITag);
  }

  /**
   * @inheritDoc
   */
  removePrimitive() {
    var tileset = /** @type {Cesium.Cesium3DTileset} */ (this.getPrimitive());

    if (tileset) {
      tileset.loadProgress.removeEventListener(this.onTileProgress, this);
    }

    super.removePrimitive();
  }

  /**
   * @inheritDoc
   */
  synchronize() {
    super.synchronize();

    if (!this.hasError()) {
      var tilesetUrl = '';
      if (!isNaN(this.assetId)) {
        if (!this.accessToken) {
          promptForAccessToken().then((accessToken) => {
            // Access token provided, synchronize again to test it.
            this.accessToken = accessToken;
            this.synchronize();
          }, () => {
            // Remove the layer if the access token prompt was canceled.
            const removeEvent = new LayerEvent(LayerEventType.REMOVE, this.getId());
            dispatcher.getInstance().dispatchEvent(removeEvent);
          });
        } else {
          tilesetUrl = createIonAssetUrl(this.assetId, this.accessToken);

          tilesetUrl.then(() => {
            // Access token is valid, prompt the user to enable Cesium World Terrain if configured.
            this.checkWorldTerrain();
          }, () => {
            // Access token is invalid. Notify the user.
            this.setTokenError_('The provided Cesium Ion access token is invalid.');
          });
        }
      } else {
        tilesetUrl = this.url;
      }

      if (tilesetUrl) {
        var tileset = new Cesium.Cesium3DTileset({
          url: tilesetUrl
        });

        if (this.tileStyle != null) {
          tileset.style = new Cesium.Cesium3DTileStyle(this.tileStyle);
        } else {
          tileset.style = new Cesium.Cesium3DTileStyle({
            'color': {
              'evaluateColor': this.getFeatureColor.bind(this)
            }
          });
        }

        this.setPrimitive(tileset);
        tileset.loadProgress.addEventListener(this.onTileProgress, this);
      }
    }
  }

  /**
   * Prompt the user to enable Cesium World Terrain if configured.
   * @protected
   */
  checkWorldTerrain() {
    if (this.useWorldTerrain) {
      const layerTitle = this.getTitle() || 'The activated layer';
      promptForWorldTerrain(`
        ${layerTitle} is best displayed with Cesium World Terrain. Would you like to activate it now?
      `);
    }
  }

  /**
   * @param {string} errorMsg The message of the error
   * @protected
   */
  setTokenError_(errorMsg) {
    if (this.tokenError_ !== errorMsg) {
      this.tokenError_ = errorMsg;
      this.updateError();
    }
  }

  /**
   * Get the color for a 3D tile feature.
   *
   * @param {Cesium.Cesium3DTileFeature} feature The feature.
   * @param {Cesium.Color} result The object to store the result.
   * @return {Cesium.Color} The color.
   */
  getFeatureColor(feature, result) {
    var cssColor = this.getColor() || osStyle.DEFAULT_LAYER_COLOR;
    var cesiumColor = Cesium.Color.fromCssColorString(cssColor, result);
    cesiumColor.alpha = this.getOpacity();

    return cesiumColor;
  }

  /**
   * @inheritDoc
   */
  setColor(value) {
    super.setColor(value);

    var tileset = /** @type {Cesium.Cesium3DTileset} */ (this.getPrimitive());
    if (tileset) {
      tileset.makeStyleDirty();
      dispatcher.getInstance().dispatchEvent(MapEvent.GL_REPAINT);
    }
  }

  /**
   * @inheritDoc
   */
  setOpacity(value) {
    super.setOpacity(value);

    var tileset = /** @type {Cesium.Cesium3DTileset} */ (this.getPrimitive());
    if (tileset) {
      tileset.makeStyleDirty();
      dispatcher.getInstance().dispatchEvent(MapEvent.GL_REPAINT);
    }
  }

  /**
   * @param {number} pendingRequests The number of pending requests
   * @param {number} tilesProcessing The number of tiles currently being processed
   * @protected
   */
  onTileProgress(pendingRequests, tilesProcessing) {
    this.setLoading(pendingRequests > 0);
  }

  /**
   * @inheritDoc
   */
  restore(config) {
    super.restore(config);

    if (typeof config['assetId'] == 'number') {
      this.assetId = /** @type {number} */ (config['assetId']);
    }

    if (config['accessToken']) {
      this.accessToken = /** @type {string} */ (config['accessToken']);
    } else {
      this.accessToken = /** @type {string} */ (settings.getInstance().get(SettingsKey.ACCESS_TOKEN, ''));
    }

    if (config['tileStyle']) {
      this.tileStyle = /** @type {Object|string} */ (config['tileStyle']);
    }

    if (config['url']) {
      this.url = /** @type {string} */ (config['url']);
    }

    this.useWorldTerrain = !!config['useWorldTerrain'];
  }

  /**
   * @inheritDoc
   */
  getErrorMessage() {
    var error = super.getErrorMessage();
    if (!error) {
      error = this.tokenError_;
    }

    return error;
  }

  /**
   * @inheritDoc
   */
  getExtent() {
    try {
      var tileset = /** @type {Cesium.Cesium3DTileset} */ (this.primitive);
      if (tileset && tileset.root && tileset.root.contentBoundingVolume) {
        var extent = rectangleToExtent(tileset.root.contentBoundingVolume.rectangle);
        if (extent) {
          return transformExtent(extent, EPSG4326, osMap.PROJECTION);
        }
      }
    } catch (e) {
      log.error(logger, e);
    }
    return super.getExtent();
  }

  /**
   * @inheritDoc
   */
  supportsAction(type, opt_actionArgs) {
    switch (type) {
      case ActionEventType.GOTO:
        return this.getExtent() != null;
      default:
        break;
    }
    return super.supportsAction(type, opt_actionArgs);
  }
}

exports = Layer;
