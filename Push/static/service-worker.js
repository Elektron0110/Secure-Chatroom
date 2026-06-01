self.addEventListener('push', function(event) {
    const payload = event.data ? event.data.json() : {};

    const options = {
        body: payload.body || 'Нет текста',
        icon: payload.icon || '/static/icon.png',
        badge: '/static/badge.png'
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Уведомление', options)
    );
});

self.addEventListener('install', function(event) {
    console.log('Service Worker установлен.');
});

self.addEventListener('activate', function(event) {
    console.log('Service Worker активирован.');
});