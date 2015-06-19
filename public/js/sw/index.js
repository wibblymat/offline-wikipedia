require('regenerator/runtime');
require('serviceworker-cache-polyfill');
var wikipedia = require('../shared/wikipedia');
var storage = require('../shared/storage');

var version = '20';
var prefix = 'wikioffline';
var staticCacheName = `${prefix}-static-v${version}`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(staticCacheName).then(cache => {
      return cache.addAll([
        '/',
        new Request('/shell.html', {credentials: 'include'}),
        '/js/page.js',
        '/js/page-framework.js', // yeahhhh, we're caching waayyyyy more than we need, but keeps the request tests fair
        '/css/head-wiki.css', // don't need this when it's inlined, but helps when rendered with blocking CSS in settings
        '/css/wiki.css',
        '/css/flags.css',
        '/components/polymer/polymer.html',
        '/components/polymer/polymer-mini.html',
        '/components/polymer/polymer-micro.html',
        '/vulcanized.html',
        '/components/webcomponentsjs/webcomponents-lite.min.js',
        // Non-vulcanized versions too
        '/components.html',

        '/components/iron-a11y-keys-behavior/iron-a11y-keys-behavior.html',
        '/components/iron-autogrow-textarea/iron-autogrow-textarea.html',
        '/components/iron-behaviors/iron-button-state.html',
        '/components/iron-behaviors/iron-control-state.html',
        '/components/iron-flex-layout/iron-flex-layout.html',
        '/components/iron-flex-layout/classes/iron-flex-layout.html',
        '/components/iron-flex-layout/classes/iron-shadow-flex-layout.html',
        '/components/iron-form-element-behavior/iron-form-element-behavior.html',
        '/components/iron-icon/iron-icon.html',
        '/components/iron-iconset-svg/iron-iconset-svg.html',
        '/components/iron-input/iron-input.html',
        '/components/iron-meta/iron-meta.html',
        '/components/iron-validatable-behavior/iron-validatable-behavior.html',
        '/components/paper-behaviors/paper-button-behavior.html',
        '/components/paper-behaviors/paper-inky-focus-behavior.html',
        '/components/paper-icon-button/paper-icon-button.html',
        '/components/paper-input/all-imports.html',
        '/components/paper-input/paper-input-addon-behavior.html',
        '/components/paper-input/paper-input-behavior.html',
        '/components/paper-input/paper-input-char-counter.html',
        '/components/paper-input/paper-input-container.html',
        '/components/paper-input/paper-input-error.html',
        '/components/paper-input/paper-input.html',
        '/components/paper-input/paper-textarea.html',
        '/components/paper-ripple/paper-ripple.html',
        '/components/paper-styles/color.html',
        '/components/paper-styles/default-theme.html',
        '/components/paper-styles/demo-pages.html',
        '/components/paper-styles/paper-styles-classes.html',
        '/components/paper-styles/paper-styles.html',
        '/components/paper-styles/shadow.html',
        '/components/paper-styles/typography.html',
        '/components/paper-toggle-button/paper-toggle-button.html',
        '/components/paper-toggle-button/paper-toggle-button.css',
        '/components/platinum-sw/platinum-sw-cache.html',
        '/components/platinum-sw/platinum-sw-elements.html',
        '/components/platinum-sw/platinum-sw-fetch.html',
        '/components/platinum-sw/platinum-sw-import-script.html',
        '/components/platinum-sw/platinum-sw-register.html',
        '/components/wiki-icons/wiki-icons.html',


        '/components/platinum-sw/platinum-sw-register.html',
      ]);
    })
  );
});

var expectedCaches = [
  staticCacheName
];

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key.indexOf(prefix + '-') === 0
            && key.indexOf(`${prefix}-article-`) !== 0
            && expectedCaches.indexOf(key) === -1) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// This will vanish when the ServiceWorker closes,
// but that's cool, I want that.
var dataTmpCache = {};

self.addEventListener('fetch', event => {
  var requestURL = new URL(event.request.url);

  // catch the root request
  if (requestURL.origin == location.origin) {
    if (requestURL.pathname == '/') {
      event.respondWith(caches.match('/'));
      return;
    }
    if (requestURL.pathname == '/shell.html') {
      event.respondWith(caches.match('/shell.html'));
      return;
    }
    if (requestURL.pathname.indexOf('/wiki/') === 0) {
      if (/\.(json|inc)$/.test(requestURL.pathname)) {
        if (dataTmpCache[requestURL.href]) {
          var response = dataTmpCache[requestURL.href];
          delete dataTmpCache[requestURL.href];
          event.respondWith(response);
        }
        return;
      }

      // Get ahead of the pack by starting the json request now
      var jsonURL = new URL(requestURL);
      jsonURL.pathname += '.json';
      jsonURL.search = '';
      var incURL = new URL(requestURL);
      incURL.pathname += '.inc';
      incURL.search = '';
      dataTmpCache[jsonURL.href] = fetch(jsonURL, {
        credentials: 'include' // needed for flag cookies
      });
      dataTmpCache[incURL.href] = fetch(incURL, {
        credentials: 'include' // needed for flag cookies
      });

      event.respondWith(caches.match('/shell.html'));
      return;
    }
  }

  // default fetch behaviour
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('sync', event => {
  // My use of storage here has race conditions. Meh.
  console.log("Good lord, a sync event");

  event.waitUntil(
    storage.get('to-bg-cache').then(toCache => {
      toCache = toCache || [];

      return Promise.all(toCache.map(async articleName => {
        var article = await wikipedia.article(articleName);
        await article.cache();
        registration.showNotification((await article.meta).title + " ready!", {
          icon: "/imgs/wikipedia-192.png",
          body: "View the article",
          data: (await article.meta).urlId
        });
      }));
    }).then(_ => {
      storage.set('to-bg-cache', []);
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  // assuming only one type of notification right now
  event.notification.close();
  clients.openWindow(`${location.origin}/wiki/${event.notification.data}`);
});

self.addEventListener('message', event => {
  if (event.data == 'skipWaiting') {
    self.skipWaiting();
  }
});
