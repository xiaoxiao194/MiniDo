const { TAG_COLORS } = require('../../utils/taskCore');

Component({
  properties: {
    tags: { type: Array, value: [] }
  },
  data: {
    colors: Object.keys(TAG_COLORS).map((name) => ({ name, color: TAG_COLORS[name] }))
  },
  methods: {
    chooseColor(event) {
      this.triggerEvent('colorchange', {
        index: event.currentTarget.dataset.index,
        color: event.currentTarget.dataset.color
      });
    }
  }
});
