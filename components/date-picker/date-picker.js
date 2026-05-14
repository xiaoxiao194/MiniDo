Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' }
  },
  methods: {
    change(event) {
      this.triggerEvent('change', { value: event.detail.value });
    }
  }
});
