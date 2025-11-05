let parsedData = null;

document.addEventListener('DOMContentLoaded', function() {
  const parseBtn = document.getElementById('parseBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  const statsDiv = document.getElementById('stats');

  // Парсинг категорий
  parseBtn.addEventListener('click', async () => {
    try {
      statusDiv.textContent = '⏳ Ожидание загрузки данных... (это может занять до 10 сек)';
      statusDiv.className = 'status info';
      resultsDiv.innerHTML = '';
      statsDiv.innerHTML = '';
      parseBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Сначала проверяем перехваченные AJAX данные
      const interceptedResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => window.__interceptedData__
      });

      // Основной парсинг
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: parseCategories
      });

      if (results && results[0] && results[0].result) {
        parsedData = results[0].result;
        
        // Добавляем перехваченные данные если есть
        if (interceptedResults && interceptedResults[0] && interceptedResults[0].result) {
          parsedData.interceptedAjax = interceptedResults[0].result.ajax.length;
          parsedData.interceptedFetch = interceptedResults[0].result.fetch.length;
        }
        
        displayResults(parsedData);
        
        statusDiv.textContent = '✅ Данные успешно спарсены!';
        statusDiv.className = 'status success';
        
        exportJsonBtn.disabled = false;
        exportCsvBtn.disabled = false;
        exportTxtBtn.disabled = false;
        clearBtn.disabled = false;
      } else {
        throw new Error('Не удалось получить данные');
      }
    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
    } finally {
      parseBtn.disabled = false;
    }
  });

  // Экспорт в JSON
  exportJsonBtn.addEventListener('click', () => {
    if (parsedData) {
      const dataStr = JSON.stringify(parsedData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `categories_${new Date().getTime()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      statusDiv.textContent = '✅ JSON файл загружен!';
      statusDiv.className = 'status success';
    }
  });

  // Экспорт в CSV
  exportCsvBtn.addEventListener('click', () => {
    if (parsedData) {
      const csv = convertToCSV(parsedData);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `categories_${new Date().getTime()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      statusDiv.textContent = '✅ CSV файл загружен!';
      statusDiv.className = 'status success';
    }
  });

  // Экспорт в TXT
  exportTxtBtn.addEventListener('click', () => {
    if (parsedData) {
      const txt = convertToTXT(parsedData);
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `categories_${new Date().getTime()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      statusDiv.textContent = '✅ TXT файл загружен!';
      statusDiv.className = 'status success';
    }
  });

  // Очистка
  clearBtn.addEventListener('click', () => {
    parsedData = null;
    resultsDiv.innerHTML = '';
    statsDiv.innerHTML = '';
    statusDiv.textContent = '';
    statusDiv.className = 'status';
    exportJsonBtn.disabled = true;
    exportCsvBtn.disabled = true;
    exportTxtBtn.disabled = true;
    clearBtn.disabled = true;
  });
});

// Функция парсинга (выполняется на странице)
async function parseCategories() {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  console.log('Начало парсинга...');
  
  // Быстрая прокрутка для ленивой загрузки
  const scrollHeight = document.documentElement.scrollHeight;
  window.scrollTo(0, scrollHeight);
  await wait(500);
  window.scrollTo(0, 0);
  await wait(500);

  console.log('Поиск категорий в основном контенте...');

  // ЖЕСТКО исключаем навигацию
  const excludeSelectors = [
    'header',
    'nav', 
    'footer',
    '.header',
    '.nav',
    '.navigation',
    '.navbar',
    '.footer',
    '.menu',
    '.top-menu',
    '.main-menu',
    '[role="navigation"]',
    '[class*="header"]',
    '[class*="Header"]',
    '[class*="nav"]',
    '[class*="Nav"]',
    '[class*="menu"]',
    '[class*="Menu"]',
    '[class*="footer"]',
    '[class*="Footer"]'
  ];

  // Помечаем все исключаемые элементы
  excludeSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        el.setAttribute('data-exclude-parse', 'true');
      });
    } catch(e) {}
  });

  console.log('Исключено элементов навигации:', document.querySelectorAll('[data-exclude-parse="true"]').length);

  // ПАРСИМ ВСЕ ССЫЛКИ из основного контента
  const allLinks = document.querySelectorAll('a[href]');
  const categoriesMap = new Map();
  const parentMap = new Map(); // для группировки по родителям

  console.log('Всего ссылок на странице:', allLinks.length);

  allLinks.forEach(link => {
    // ЖЕСТКО пропускаем ссылки из навигации
    if (link.closest('[data-exclude-parse="true"]')) {
      return;
    }

    const text = link.textContent.trim();
    const url = link.href;
    
    // Минимальные фильтры
    if (!text || !url) return;
    if (url.includes('#')) return;
    if (text.length < 1) return;
    
    // Исключаем служебные ссылки
    const lowerText = text.toLowerCase();
    const excludeWords = ['sign in', 'log in', 'войти', 'вход', 'регистрация'];
    if (excludeWords.some(word => lowerText === word)) return;

    // Получаем родительский элемент для группировки подкатегорий
    const parent = link.closest('ul, ol, div[class*="list"], div[class*="grid"], div[class*="category"], div[class*="catalog"]');
    const parentId = parent ? parent.getAttribute('data-parent-id') || Math.random().toString(36) : 'root';
    
    if (parent && !parent.getAttribute('data-parent-id')) {
      parent.setAttribute('data-parent-id', parentId);
    }

    // Сохраняем все ссылки
    if (!categoriesMap.has(url)) {
      categoriesMap.set(url, {
        name: text,
        url: url,
        parentId: parentId,
        element: link,
        subcategories: []
      });
    }
  });

  console.log('Найдено уникальных ссылок в контенте:', categoriesMap.size);

  // Группируем подкатегории
  const categories = Array.from(categoriesMap.values());
  const parentToChildren = new Map();

  categories.forEach(cat => {
    if (!parentToChildren.has(cat.parentId)) {
      parentToChildren.set(cat.parentId, []);
    }
    parentToChildren.get(cat.parentId).push(cat);
  });

  // Формируем результат
  const result = [];
  let id = 1;

  categories.forEach(category => {
    // Ищем подкатегории в том же родителе
    const siblings = parentToChildren.get(category.parentId) || [];
    const subcats = [];
    
    // Пробуем найти дочерние элементы
    try {
      const parentEl = category.element.closest('li, div[class*="item"], article');
      if (parentEl) {
        const childLinks = parentEl.querySelectorAll('a[href]');
        childLinks.forEach(childLink => {
          if (childLink !== category.element && !childLink.closest('[data-exclude-parse="true"]')) {
            const subText = childLink.textContent.trim();
            const subUrl = childLink.href;
            if (subText && subUrl && subUrl !== category.url) {
              subcats.push({
                name: subText,
                url: subUrl
              });
            }
          }
        });
      }
    } catch(e) {}

    result.push({
      id: id++,
      name: category.name,
      url: category.url,
      subcategories: subcats,
      subcategoryCount: subcats.length
    });
  });

  console.log('Итого категорий после обработки:', result.length);

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    totalCategories: result.length,
    totalSubcategories: result.reduce((sum, cat) => sum + cat.subcategoryCount, 0),
    categories: result
  };
}

// Отображение результатов
function displayResults(data) {
  const resultsDiv = document.getElementById('results');
  const statsDiv = document.getElementById('stats');
  
  // Статистика
  statsDiv.innerHTML = `
    <div><strong>URL:</strong> ${data.url}</div>
    <div><strong>Всего категорий:</strong> ${data.totalCategories}</div>
    <div><strong>Всего подкатегорий:</strong> ${data.totalSubcategories}</div>
    <div><strong>Время парсинга:</strong> ${new Date(data.timestamp).toLocaleString('ru-RU')}</div>
  `;

  // Категории
  if (data.categories.length === 0) {
    resultsDiv.innerHTML = '<p style="color: #666;">Категории не найдены</p>';
    return;
  }

  data.categories.forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-item';
    
    let html = `
      <div class="category-name">${category.name}</div>
      ${category.url ? `<div class="category-url">${category.url}</div>` : ''}
    `;

    if (category.subcategories && category.subcategories.length > 0) {
      html += `<div class="subcategories">`;
      category.subcategories.forEach(sub => {
        html += `
          <div class="subcategory-item">
            <div class="subcategory-name">${sub.name}</div>
            <div class="subcategory-url">${sub.url}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    categoryDiv.innerHTML = html;
    resultsDiv.appendChild(categoryDiv);
  });
}

// Конвертация в CSV
function convertToCSV(data) {
  let csv = 'ID,Категория,URL категории,Подкатегория,URL подкатегории\n';
  
  data.categories.forEach(category => {
    if (category.subcategories && category.subcategories.length > 0) {
      category.subcategories.forEach(sub => {
        csv += `${category.id},"${escapeCSV(category.name)}","${category.url}","${escapeCSV(sub.name)}","${sub.url}"\n`;
      });
    } else {
      csv += `${category.id},"${escapeCSV(category.name)}","${category.url}","",""\n`;
    }
  });
  
  return csv;
}

function escapeCSV(str) {
  if (!str) return '';
  return str.replace(/"/g, '""');
}

// Конвертация в TXT (только названия)
function convertToTXT(data) {
  let txt = '';
  
  data.categories.forEach(category => {
    // Добавляем категорию
    txt += category.name + '\n';
    
    // Добавляем подкатегории с отступом
    if (category.subcategories && category.subcategories.length > 0) {
      category.subcategories.forEach(sub => {
        txt += '  - ' + sub.name + '\n';
      });
    }
  });
  
  return txt;
}

