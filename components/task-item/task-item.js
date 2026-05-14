Component({
  properties: {
    task: { type: Object, value: {} }
  },
  methods: {
    toggle() {
      this.triggerEvent('toggle', { id: this.data.task.id });
    },
    open() {
      this.triggerEvent('open', { id: this.data.task.id });
    },
    action(event) {
      this.triggerEvent('action', { id: this.data.task.id, action: event.currentTarget.dataset.action });
    }
  }
});
