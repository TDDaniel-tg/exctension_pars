// Content script для перехвата AJAX запросов
console.log('Category Parser extension loaded');

// Храним перехваченные данные
window.__interceptedData__ = {
  ajax: [],
  fetch: []
};

// Перехват XMLHttpRequest
(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      try {
        const data = JSON.parse(this.responseText);
        if (this._url && (
          this._url.includes('categor') || 
          this._url.includes('menu') || 
          this._url.includes('product') ||
          this._url.includes('catalog')
        )) {
          window.__interceptedData__.ajax.push({
            url: this._url,
            method: this._method,
            response: data,
            timestamp: new Date().toISOString()
          });
          console.log('Перехвачен AJAX запрос:', this._url);
        }
      } catch (e) {}
    });
    return originalSend.apply(this, arguments);
  };
})();

// Перехват Fetch
(function() {
  const originalFetch = window.fetch;
  window.fetch = function() {
    return originalFetch.apply(this, arguments).then(response => {
      const clonedResponse = response.clone();
      const url = arguments[0];
      
      if (typeof url === 'string' && (
        url.includes('categor') || 
        url.includes('menu') || 
        url.includes('product') ||
        url.includes('catalog')
      )) {
        clonedResponse.json().then(data => {
          window.__interceptedData__.fetch.push({
            url: url,
            response: data,
            timestamp: new Date().toISOString()
          });
          console.log('Перехвачен Fetch запрос:', url);
        }).catch(() => {});
      }
      
      return response;
    });
  };
})();

console.log('AJAX/Fetch перехватчик активирован');

