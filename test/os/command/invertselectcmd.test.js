goog.require('goog.events.EventType');
goog.require('ol.Feature');
goog.require('ol.events');
goog.require('ol.geom.Point');
goog.require('os.command.InvertSelect');
goog.require('os.command.State');
goog.require('os.data.DataManager');
goog.require('os.data.DataManager');
goog.require('os.mock');
goog.require('os.source.PropertyChange');
goog.require('os.source.Vector');


describe('os.command.InvertSelect', function() {
  const GoogEventType = goog.module.get('goog.events.EventType');
  const Feature = goog.module.get('ol.Feature');
  const events = goog.module.get('ol.events');
  const Point = goog.module.get('ol.geom.Point');
  const InvertSelect = goog.module.get('os.command.InvertSelect');
  const State = goog.module.get('os.command.State');
  const DataManager = goog.module.get('os.data.DataManager');
  const PropertyChange = goog.module.get('os.source.PropertyChange');
  const VectorSource = goog.module.get('os.source.Vector');

  it('should fail when the source is not provided', function() {
    var cmd = new InvertSelect(null);
    expect(cmd.execute()).toBe(false);
    expect(cmd.state).toBe(State.ERROR);
  });

  it('should select all the features on the source', function() {
    // features are not added to crossfilter until the add timer expires, so we have to wait for that
    // before continuing with tests
    var featuresAdded = false;
    var onChange = function(e) {
      if (e.getProperty() == PropertyChange.FEATURES) {
        featuresAdded = true;
      }
    };

    var src = new VectorSource();
    src.setId('testy');
    events.listen(src, GoogEventType.PROPERTYCHANGE, onChange);
    for (var i = 0; i < 3; i++) {
      var f = new Feature();
      f.setId('' + i);
      f.setGeometry(new Point([0, 0]));
      src.addFeature(f);
    }

    waitsFor(function() {
      return featuresAdded;
    }, 'features to be added to crossfilter');

    runs(function() {
      events.unlisten(src, GoogEventType.PROPERTYCHANGE, onChange);
      src.addToSelected(f);
      DataManager.getInstance().addSource(src);

      var cmd = new InvertSelect(src.getId());
      expect(cmd.execute()).toBe(true);
      expect(cmd.state).toBe(State.SUCCESS);
      expect(src.getSelectedItems().length).toBe(2);

      expect(cmd.revert()).toBe(true);
      expect(cmd.state).toBe(State.READY);
      expect(src.getSelectedItems().length).toBe(1);

      DataManager.getInstance().removeSource(src);
    });
  });
});
