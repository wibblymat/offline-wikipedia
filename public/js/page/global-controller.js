require('regenerator/runtime');

var debounce = require('debounce');
var wikipedia = require('../shared/wikipedia');
var flags = require('./flags').parse();

class GlobalController {
  constructor() {
    // ui
    this._toolbarView = new (require('./views/toolbar'));
    this._searchResultsView = new (require('./views/search-results'));
    this._toastsView = require('./views/toasts');

    // view events
    this._toolbarView.on('searchInput', event => {
      if (!event.value) {
        this._onSearchInput(event);
        return;
      }
      debouncedSearch(event);
    });

    // state
    this._setupServiceWorker();
    this._lastSearchId = 0;

    // setup
    var debouncedSearch = debounce(e => this._onSearchInput(e), 150);

    // router
    if (location.pathname == '/') {
      new (require('./home-controller'));
    }
    else if (/^\/wiki\/[^\/]+/.test(location.pathname)) {
      new (require('./article-controller'));
    }
    else if (location.pathname == '/flags') {
      new (require('./flags-controller'));
    }
  }

  async _setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    if (flags.get('prevent-sw')) {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        console.log('ServiceWorker prevented due to flags');
        return;
      }
      console.log('ServiceWorker found & unregistered - refresh to load without');
      reg.unregister();
      return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', _ => this._onSwControllerChange());

    var ptSw = document.createElement('platinum-sw-register');
    ptSw.setAttribute('href', '/sw.js');
    ptSw.setAttribute('auto-register', true);
    ptSw.addEventListener('service-worker-updated', _ => this._onSwUpdateReady());
    ptSw.addEventListener('service-worker-installed', _ => this._onSwUpdateFound());
    document.body.appendChild(ptSw);
  }

  _onSwControllerChange() {
    location.reload();
  }

  async _onSwUpdateReady() {
    var toast = this._toastsView.show("Update available", {
      buttons: ['reload', 'dismiss']
    });

    var newWorker = (await navigator.serviceWorker.getRegistration()).waiting;
    var answer = await toast.answer;

    if (answer == 'reload') {
      newWorker.postMessage('skipWaiting');
    }
  }

  _offlineReady() {
    this._toastsView.show("Ready to work offline", {
      duration: 5000
    });
  }

  async _onSwUpdateFound() {
    var registration = await navigator.serviceWorker.getRegistration();
    var newWorker = registration.installing || registration.waiting || registration.active;

    if (newWorker.state == 'activated' && !navigator.serviceWorker.controller) {
      this._offlineReady();
    }

    if (newWorker.state == 'installed') {
      if (navigator.serviceWorker.controller) {
        return this._onSwUpdateReady();
      }

      newWorker.addEventListener('statechange', _ => {
        // the very first activation!
        // tell the user stuff works offline
        if (newWorker.state == 'activated') {
          this._offlineReady();
        }
      });
    }
  }

  async _onSearchInput({value}) {
    var id = ++this._lastSearchId;

    if (!value) {
      this._searchResultsView.hide();
      return;
    }

    var results;

    try {
      results = {results: await wikipedia.search(value)};
    }
    catch (e) {
      results = {err: "Search failed"};
    }

    requestAnimationFrame(_ => {
      if (id != this._lastSearchId) return;
      this._searchResultsView.update(results);
    });
  }
}

module.exports = GlobalController;
