let parsedData = null;
let parsedDataType = null;

document.addEventListener('DOMContentLoaded', function() {
  const parseBtn = document.getElementById('parseBtn');
  const deepParseBtn = document.getElementById('deepParseBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const exportSqlBtn = document.getElementById('exportSqlBtn');
  const downloadImagesBtn = document.getElementById('downloadImagesBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  const statsDiv = document.getElementById('stats');
  const progressDiv = document.getElementById('progress');
  const parseImagesCheckbox = document.getElementById('parseImagesCheckbox');
  const translateCheckbox = document.getElementById('translateCheckbox');
  const tabButtons = document.querySelectorAll('.tab-button');
  const categorySection = document.getElementById('categorySection');
  const productSection = document.getElementById('productSection');
  const parseProductsBtn = document.getElementById('parseProductsBtn');
  const deepParseProductsBtn = document.getElementById('deepParseProductsBtn');

  let currentTab = 'categories';

  function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    categorySection.classList.toggle('active', tab === 'categories');
    productSection.classList.toggle('active', tab === 'products');
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  // Быстрый парсинг категорий
  parseBtn.addEventListener('click', async () => {
    try {
      statusDiv.textContent = '⏳ Парсинг текущей страницы...';
      statusDiv.className = 'status info';
      resultsDiv.innerHTML = '';
      statsDiv.innerHTML = '';
      progressDiv.innerHTML = '';
      parseBtn.disabled = true;
      deepParseBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const parseImages = parseImagesCheckbox.checked;
      
      // Основной парсинг
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
  func: parseCategories,
  args: [parseImages],
  world: 'MAIN' // Добавляем это для обхода CSP
      });

      if (results && results[0] && results[0].result) {
        parsedDataType = 'categories';
        parsedData = results[0].result;
        parsedData.type = 'categories';
        displayResults(parsedData);
        
        // Подсчитываем изображения
        const totalImages = parsedData.categories.reduce((sum, cat) => {
          let count = cat.image ? 1 : 0;
          if (cat.subcategories) {
            count += cat.subcategories.filter(sub => sub.image).length;
          }
          return sum + count;
        }, 0);
        
        console.log('Всего найдено изображений:', totalImages);
        
        statusDiv.textContent = `✅ Данные успешно спарсены!${parseImages ? ` Найдено изображений: ${totalImages}` : ''}`;
        statusDiv.className = 'status success';
        
        exportJsonBtn.disabled = false;
        exportCsvBtn.disabled = false;
        exportTxtBtn.disabled = false;
        exportSqlBtn.disabled = false;
        downloadImagesBtn.disabled = totalImages === 0;
        clearBtn.disabled = false;
      } else {
        throw new Error('Не удалось получить данные');
      }
    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
    } finally {
      parseBtn.disabled = false;
      deepParseBtn.disabled = false;
    }
  });

  // Глубокий парсинг - заходит в каждую категорию
  deepParseBtn.addEventListener('click', async () => {
    try {
      statusDiv.textContent = '🚀 Глубокий парсинг запущен...';
      statusDiv.className = 'status info';
      resultsDiv.innerHTML = '';
      statsDiv.innerHTML = '';
      progressDiv.innerHTML = '';
      parseBtn.disabled = true;
      deepParseBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const parseImages = parseImagesCheckbox.checked;
      
      // Шаг 1: Парсим категории на главной
      statusDiv.textContent = '📋 Шаг 1: Сбор категорий с главной страницы...';
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: parseCategories,
        args: [parseImages],
        world: 'MAIN'
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Не удалось получить категории');
      }

      const mainCategories = results[0].result.categories;
      statusDiv.textContent = `🔍 Найдено ${mainCategories.length} категорий. Парсинг подкатегорий с каждой страницы...`;
      
      // Шаг 2: Заходим в каждую категорию и парсим подкатегории
      const deepData = {
        url: results[0].result.url,
        timestamp: new Date().toISOString(),
        totalCategories: 0,
        totalSubcategories: 0,
        categories: []
      };

      console.log(`📋 Всего категорий для парсинга: ${mainCategories.length}`);

      for (let i = 0; i < mainCategories.length; i++) {
        const category = mainCategories[i];
        
        // Обновляем прогресс
        const percent = Math.round(((i + 1) / mainCategories.length) * 100);
        progressDiv.innerHTML = `
          <div><strong>Прогресс:</strong> ${i + 1} из ${mainCategories.length} категорий</div>
          <div style="margin-top: 8px;"><strong>Текущая:</strong> ${category.name}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percent}%">${percent}%</div>
          </div>
        `;

        try {
          console.log(`\n🔍 Парсинг категории: ${category.name}`);
          console.log(`📄 URL: ${category.url}`);
          
          // Открываем страницу категории в текущей вкладке
          await chrome.tabs.update(tab.id, { url: category.url });
          
          // Ждем загрузки страницы
          await new Promise(resolve => {
            const listener = (tabId, changeInfo) => {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            
            // Таймаут на случай если событие не сработает
            setTimeout(resolve, 5000);
          });
          
          // Ещё немного ждем для динамической загрузки
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Парсим подкатегории на загруженной странице
          const subcatResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: parseCategories,
            args: [parseImages],
            world: 'MAIN'
          });
          
          const subcats = subcatResults && subcatResults[0] && subcatResults[0].result 
            ? subcatResults[0].result.categories 
            : [];
          
          // Убираем дубликаты по URL и изображению
          const uniqueSubcats = [];
          const seenUrls = new Set();
          const seenImages = new Set();
          
          subcats.forEach(subcat => {
            // Проверяем уникальность URL
            if (!seenUrls.has(subcat.url)) {
              seenUrls.add(subcat.url);
              
              // Если есть изображение, проверяем его уникальность
              if (subcat.image) {
                if (!seenImages.has(subcat.image)) {
                  seenImages.add(subcat.image);
                  uniqueSubcats.push({
                    name: subcat.name,
                    url: subcat.url,
                    image: subcat.image
                  });
                } else {
                  console.log(`⚠️ Дубликат изображения пропущен для: ${subcat.name}`);
                }
              } else {
                uniqueSubcats.push({
                  name: subcat.name,
                  url: subcat.url,
                  image: ''
                });
              }
            }
          });
          
          console.log(`✅ Найдено подкатегорий: ${subcats.length}`);
          console.log(`🎯 Уникальных подкатегорий: ${uniqueSubcats.length}`);
          if (parseImages) {
            const withImages = uniqueSubcats.filter(s => s.image).length;
            console.log(`📷 Подкатегорий с изображениями: ${withImages}`);
          }
          
          // Если подкатегорий нет, пропускаем эту категорию (не добавляем в результат)
          if (uniqueSubcats.length > 0) {
            deepData.categories.push({
              id: deepData.categories.length + 1,
              name: category.name,
              url: category.url,
              image: category.image || '',
              subcategories: uniqueSubcats,
              subcategoryCount: uniqueSubcats.length
            });

            deepData.totalSubcategories += uniqueSubcats.length;
          } else {
            console.log(`⏭️ Категория "${category.name}" пропущена - нет подкатегорий`);
          }
          
        } catch (error) {
          console.error(`❌ Ошибка парсинга ${category.url}:`, error);
          // Не добавляем категории с ошибками
        }
      }

      deepData.totalCategories = deepData.categories.length;
      parsedDataType = 'categories';
      parsedData = deepData;
      parsedData.type = 'categories';

      displayResults(parsedData);
      
      // Подсчитываем изображения
      const totalImages = parsedData.categories.reduce((sum, cat) => {
        let count = cat.image ? 1 : 0;
        if (cat.subcategories) {
          count += cat.subcategories.filter(sub => sub.image).length;
        }
        return sum + count;
      }, 0);
      
      console.log('Всего найдено изображений:', totalImages);
      
      statusDiv.textContent = `✅ Глубокий парсинг завершен!${parseImages ? ` Найдено изображений: ${totalImages}` : ''}`;
      statusDiv.className = 'status success';
      progressDiv.innerHTML = '';
      
      exportJsonBtn.disabled = false;
      exportCsvBtn.disabled = false;
      exportTxtBtn.disabled = false;
      downloadImagesBtn.disabled = totalImages === 0;
      clearBtn.disabled = false;

    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
      progressDiv.innerHTML = '';
    } finally {
      parseBtn.disabled = false;
      deepParseBtn.disabled = false;
    }
  });

  // Быстрый парсинг товаров - НЕ переходит на страницы товаров, парсит только текущую страницу
  parseProductsBtn.addEventListener('click', async () => {
    try {
      statusDiv.textContent = '⏳ Парсинг товаров на текущей странице...';
      statusDiv.className = 'status info';
      resultsDiv.innerHTML = '';
      statsDiv.innerHTML = '';
      progressDiv.innerHTML = '';
      parseProductsBtn.disabled = true;
      deepParseProductsBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const parseImages = parseImagesCheckbox.checked;

      // Обычный парсинг - только текущая страница, БЕЗ перехода на страницы товаров
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: parseProducts,
        args: [parseImages]
      });

      if (results && results[0] && results[0].result) {
        parsedDataType = 'products';
        parsedData = results[0].result;
        parsedData.type = 'products';
        if (!parsedData.products) {
          throw new Error('Не удалось определить список товаров');
        }

        // Обновляем счетчики
        parsedData.totalProducts = parsedData.products.length;
        parsedData.totalImages = parsedData.products.reduce((sum, product) => {
          if (product.images && product.images.length > 0) {
            return sum + product.images.length;
          }
          return sum + (product.image ? 1 : 0);
        }, 0);

        displayResults(parsedData);

        statusDiv.textContent = `✅ Найдено товаров: ${parsedData.totalProducts}${parseImages ? ` | Изображений: ${parsedData.totalImages}` : ''}`;
        statusDiv.className = 'status success';

        exportJsonBtn.disabled = false;
        exportCsvBtn.disabled = false;
        exportTxtBtn.disabled = false;
        exportSqlBtn.disabled = false;
        downloadImagesBtn.disabled = parsedData.totalImages === 0;
        clearBtn.disabled = false;
      } else {
        throw new Error('Не удалось получить товары');
      }
    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
    } finally {
      parseProductsBtn.disabled = false;
      deepParseProductsBtn.disabled = false;
    }
  });

  // Глубокий парсинг товаров - ПЕРЕХОДИТ на каждую страницу товара для получения полного описания
  deepParseProductsBtn.addEventListener('click', async () => {
    try {
      statusDiv.textContent = '🚀 Глубокий парсинг товаров...';
      statusDiv.className = 'status info';
      resultsDiv.innerHTML = '';
      statsDiv.innerHTML = '';
      progressDiv.innerHTML = '';
      parseProductsBtn.disabled = true;
      deepParseProductsBtn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const parseImages = parseImagesCheckbox.checked;
      const shouldTranslate = translateCheckbox.checked;

      // Шаг 1: парсим текущую страницу
      statusDiv.textContent = '📋 Сбор товаров с текущей страницы...';
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
  func: parseProducts,
  args: [true], // собираем базовые изображения сразу
  world: 'MAIN' // Добавляем это для обхода CSP
      });

      if (!results || !results[0] || !results[0].result || !results[0].result.products) {
        throw new Error('Не удалось получить список товаров');
      }

      const baseData = results[0].result;
      const uniqueProductsMap = new Map();

      baseData.products.forEach(product => {
        if (product.url && !uniqueProductsMap.has(product.url)) {
          uniqueProductsMap.set(product.url, product);
        }
      });

      const productsToProcess = Array.from(uniqueProductsMap.values());
      console.log(`📋 Товаров для парсинга: ${productsToProcess.length}`);

      const detailedProducts = [];
      // Сохраняем URL исходной страницы для возврата
      const originalUrl = tab.url;
      let totalImages = 0;

      for (let i = 0; i < productsToProcess.length; i++) {
        const product = productsToProcess[i];
        const percent = Math.round(((i + 1) / productsToProcess.length) * 100);
        progressDiv.innerHTML = `
          <div><strong>Прогресс:</strong> ${i + 1} из ${productsToProcess.length} товаров</div>
          <div style="margin-top: 8px;"><strong>Текущий товар:</strong> ${product.name || 'Без названия'}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percent}%">${percent}%</div>
          </div>
        `;

        let description = product.description || '';
        let images = [];
        if (product.images && product.images.length > 0) {
          images = product.images.slice();
        } else if (product.image) {
          images = [product.image];
        }

        if (product.url) {
          try {
            // Используем новую функцию с переходом на страницу и выполнением JS
            const details = await fetchProductDetailsWithJS(tab, product.url, parseImages);
            
            // Обновляем цену если нашли на странице товара
            if (details.price) {
              product.price = details.price;
            }
            
            // Сохраняем характеристики если нашли
            if (details.specifications) {
              product.specifications = details.specifications;
            }
            
            if (details.description) {
              description = details.description;
              
              // Переводим описание если включен перевод
              if (shouldTranslate && description && description.trim().length > 0) {
                try {
                  statusDiv.textContent = `🌐 Перевод описания товара ${i + 1} из ${productsToProcess.length}...`;
                  console.log(`📝 Переводим описание товара "${product.name}":`, description.substring(0, 100) + '...');
                  
                  const translatedDescription = await translateText(description);
                  
                  if (translatedDescription && translatedDescription.trim().length > 0) {
                    product.descriptionTranslated = translatedDescription;
                    console.log(`✅ Перевод сохранен для товара "${product.name}"`);
                  }
                  
                  // Задержка между переводами
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (translateError) {
                  console.error(`❌ Ошибка перевода для товара "${product.name}":`, translateError);
                  console.warn(`⚠️ Продолжаем без перевода для товара "${product.name}"`);
                }
              }
            }
            if (details.images && details.images.length > 0) {
              const imageSet = new Set(images);
              details.images.forEach(img => {
                if (img && img.trim().length > 10 && !img.startsWith('data:')) {
                  imageSet.add(img);
                }
              });
              images = Array.from(imageSet);
            }
          } catch (error) {
            console.error(`❌ Ошибка загрузки товара ${product.url}:`, error);
          }
        }

        // Фильтруем пустые и невалидные изображения
        const validImages = images.filter(img => {
          if (!img || typeof img !== 'string') return false;
          const trimmed = img.trim();
          return trimmed.length >= 10 && !trimmed.startsWith('data:');
        });
        
        // Убираем дубликаты
        const uniqueImages = [];
        const seenUrls = new Set();
        validImages.forEach(img => {
          const normalized = img.split('?')[0].split('#')[0];
          if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            uniqueImages.push(img);
          }
        });

        totalImages += uniqueImages.length;

        detailedProducts.push({
          id: detailedProducts.length + 1,
          name: product.name || 'Без названия',
          url: product.url || '',
          price: product.price || '',
          description: description || '',
          descriptionTranslated: product.descriptionTranslated || '',
          image: uniqueImages[0] || '',
          images: uniqueImages,
          specifications: product.specifications || {
            weight: null,
            height: null,
            width: null,
            length: null,
            volume: null
          }
        });

        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      // Возвращаемся на исходную страницу после парсинга всех товаров
      console.log(`🔙 Возврат на исходную страницу: ${originalUrl}`);
      await chrome.tabs.update(tab.id, { url: originalUrl });
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      parsedDataType = 'products';
      parsedData = {
        url: baseData.url,
        timestamp: new Date().toISOString(),
        totalProducts: detailedProducts.length,
        totalImages: totalImages,
        products: detailedProducts,
        type: 'products'
      };

      displayResults(parsedData);

      statusDiv.textContent = `✅ Глубокий парсинг завершен! Найдено товаров: ${parsedData.totalProducts}${parseImages ? ` | Изображений: ${totalImages}` : ''}`;
      statusDiv.className = 'status success';
      progressDiv.innerHTML = '';

      exportJsonBtn.disabled = false;
      exportCsvBtn.disabled = false;
      exportTxtBtn.disabled = false;
      exportSqlBtn.disabled = false; // Всегда включаем для товаров
      downloadImagesBtn.disabled = totalImages === 0;
      clearBtn.disabled = false;

    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
      progressDiv.innerHTML = '';
    } finally {
      parseProductsBtn.disabled = false;
      deepParseProductsBtn.disabled = false;
    }
  });

  // Экспорт в JSON
  exportJsonBtn.addEventListener('click', () => {
    if (parsedData) {
      const dataStr = JSON.stringify(parsedData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const prefix = parsedDataType === 'products' ? 'products' : 'categories';
      a.href = url;
      a.download = `${prefix}_${new Date().getTime()}.json`;
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
      const prefix = parsedDataType === 'products' ? 'products' : 'categories';
      a.href = url;
      a.download = `${prefix}_${new Date().getTime()}.csv`;
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
      const prefix = parsedDataType === 'products' ? 'products' : 'categories';
      a.href = url;
      a.download = `${prefix}_${new Date().getTime()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      statusDiv.textContent = '✅ TXT файл загружен!';
      statusDiv.className = 'status success';
    }
  });

  // Экспорт в SQL (миграция)
  exportSqlBtn.addEventListener('click', () => {
    if (parsedData) {
      const sql = convertToSQL(parsedData, parsedDataType);
      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const prefix = parsedDataType === 'products' ? 'products' : 'categories';
      a.href = url;
      a.download = `${prefix}_migration_${new Date().getTime()}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      
      statusDiv.textContent = '✅ SQL миграция загружена!';
      statusDiv.className = 'status success';
    }
  });

  // Скачивание всех изображений в ZIP
  downloadImagesBtn.addEventListener('click', async () => {
    if (!parsedData) return;

    try {
      statusDiv.textContent = '📷 Подготовка к скачиванию изображений...';
      statusDiv.className = 'status info';
      downloadImagesBtn.disabled = true;

      // Собираем все изображения с проверкой уникальности
      const imagesToDownload = [];
      const seenImageUrls = new Set();
      const seenFilenames = new Map(); // URL -> filename для отслеживания

      if (parsedDataType === 'products') {
        if (!parsedData.products || parsedData.products.length === 0) {
          statusDiv.textContent = '❌ Нет изображений для скачивания';
          statusDiv.className = 'status error';
          downloadImagesBtn.disabled = false;
          return;
        }

        parsedData.products.forEach((product) => {
          const images = product.images && product.images.length > 0
            ? product.images
            : (product.image ? [product.image] : []);

          images.forEach((imgUrl, index) => {
            // Пропускаем placeholder изображения
            if (imgUrl === 'placeholder') {
              console.log(`⚠️ Плейсхолдер пропущен для товара: ${product.name}`);
              return;
            }
            
            if (!imgUrl || seenImageUrls.has(imgUrl)) {
              if (imgUrl) {
                console.log(`⚠️ Дубликат изображения пропущен: ${imgUrl}`);
              }
              return;
            }
            seenImageUrls.add(imgUrl);

            const baseName = sanitizeFilename(product.name || `Товар_${product.id}`) || `product_${product.id}`;
            let filename = `${baseName}${images.length > 1 ? `_img${index + 1}` : ''}.jpg`;

            let counter = 1;
            while (Array.from(seenFilenames.values()).includes(filename)) {
              filename = `${baseName}_${counter}.jpg`;
              counter++;
            }
            seenFilenames.set(imgUrl, filename);

            imagesToDownload.push({
              url: imgUrl,
              filename: filename,
              productName: product.name || ''
            });
          });
        });
      } else if (parsedData && parsedData.categories) {
        if (!parsedData.categories || parsedData.categories.length === 0) {
          statusDiv.textContent = '❌ Нет изображений для скачивания';
          statusDiv.className = 'status error';
          downloadImagesBtn.disabled = false;
          return;
        }

        parsedData.categories.forEach((category) => {
          if (category.image && !seenImageUrls.has(category.image)) {
            seenImageUrls.add(category.image);
            const filename = `${sanitizeFilename(category.name)}.jpg`;
            seenFilenames.set(category.image, filename);
            
            imagesToDownload.push({
              url: category.image,
              filename: filename,
              categoryName: category.name
            });
          } else if (category.image && seenImageUrls.has(category.image)) {
            console.log(`⚠️ Дубликат изображения пропущен для категории: ${category.name}`);
          }

          if (category.subcategories && category.subcategories.length > 0) {
            category.subcategories.forEach((sub) => {
              if (sub.image && !seenImageUrls.has(sub.image)) {
                seenImageUrls.add(sub.image);
                let filename = `${sanitizeFilename(sub.name)}.jpg`;
                
                // Если имя файла уже существует, добавляем номер
                let counter = 1;
                const baseName = sanitizeFilename(sub.name);
                while (Array.from(seenFilenames.values()).includes(filename)) {
                  filename = `${baseName}_${counter}.jpg`;
                  counter++;
                }
                
                seenFilenames.set(sub.image, filename);
                
                imagesToDownload.push({
                  url: sub.image,
                  filename: filename,
                  categoryName: category.name,
                  subcategoryName: sub.name
                });
              } else if (sub.image && seenImageUrls.has(sub.image)) {
                console.log(`⚠️ Дубликат изображения пропущен для подкатегории: ${sub.name}`);
              }
            });
          }
        });
      }

      if (imagesToDownload.length === 0) {
        statusDiv.textContent = '❌ Нет изображений для скачивания';
        statusDiv.className = 'status error';
        downloadImagesBtn.disabled = false;
        return;
      }

      // Создаем структуру папок /storage/год/месяцдень/
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateFolder = `${year}/${month}${day}`;
      
      statusDiv.textContent = `📷 Найдено ${imagesToDownload.length} изображений. Создание структуры /storage/${dateFolder}/...`;
      
      // Создаем ZIP архив со структурой storage
      const zip = new JSZip();
      const storageFolder = zip.folder('storage');
      const dateSubfolder = storageFolder.folder(dateFolder);
      
      let downloaded = 0;
      let failed = 0;
      let imageIndex = 1;

      for (const img of imagesToDownload) {
        try {
          // Определяем расширение файла из URL
          let extension = '.jpg';
          try {
            const urlPath = new URL(img.url).pathname;
            const ext = urlPath.split('.').pop().split('?')[0].toLowerCase();
            if (ext && ext.length <= 4 && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
              extension = '.' + ext;
            }
          } catch (e) {}
          
          // Имя файла: 001.jpg, 002.jpg и т.д.
          const paddedIndex = String(imageIndex).padStart(3, '0');
          const filename = paddedIndex + extension;
          imageIndex++;
          
          console.log(`Скачивание: ${img.url} → /storage/${dateFolder}/${filename}`);
          
          // Скачиваем изображение как blob
          const response = await fetch(img.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const blob = await response.blob();
          
          // Добавляем в ZIP со структурой storage
          dateSubfolder.file(filename, blob);
          downloaded++;
          
          progressDiv.innerHTML = `
            <div><strong>Прогресс:</strong> ${downloaded + failed} из ${imagesToDownload.length}</div>
            <div><strong>Путь:</strong> /storage/${dateFolder}/${filename}</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.round(((downloaded + failed) / imagesToDownload.length) * 100)}%">
                ${Math.round(((downloaded + failed) / imagesToDownload.length) * 100)}%
              </div>
            </div>
          `;
          
        } catch (error) {
          console.error(`Ошибка загрузки ${img.url}:`, error);
          failed++;
        }
      }

      if (downloaded === 0) {
        throw new Error('Не удалось скачать ни одного изображения');
      }

      // Генерируем ZIP файл
      statusDiv.textContent = '📦 Создание ZIP архива...';
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        progressDiv.innerHTML = `
          <div><strong>Компрессия ZIP:</strong> ${Math.round(metadata.percent)}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.round(metadata.percent)}%">
              ${Math.round(metadata.percent)}%
            </div>
          </div>
        `;
      });

      // Скачиваем ZIP файл
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      const zipPrefix = parsedDataType === 'products' ? 'storage_products_' : 'storage_categories_';
      const dateStr = `${year}${month}${day}`;
      a.href = url;
      a.download = `${zipPrefix}${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      progressDiv.innerHTML = '';
      statusDiv.textContent = `✅ ZIP со структурой /storage/${dateFolder}/ создан! Скачано: ${downloaded}${failed > 0 ? `, Ошибок: ${failed}` : ''}. Распакуйте в корень проекта.`;
      statusDiv.className = 'status success';
      
    } catch (error) {
      statusDiv.textContent = '❌ Ошибка: ' + error.message;
      statusDiv.className = 'status error';
      progressDiv.innerHTML = '';
      console.error('Ошибка создания ZIP:', error);
    } finally {
      downloadImagesBtn.disabled = false;
    }
  });

  // Очистка
  clearBtn.addEventListener('click', () => {
    parsedData = null;
    parsedDataType = null;
    resultsDiv.innerHTML = '';
    statsDiv.innerHTML = '';
    statusDiv.textContent = '';
    statusDiv.className = 'status';
    progressDiv.innerHTML = '';
    exportJsonBtn.disabled = true;
    exportCsvBtn.disabled = true;
    exportTxtBtn.disabled = true;
    exportSqlBtn.disabled = true;
    downloadImagesBtn.disabled = true;
    clearBtn.disabled = true;
  });
});

// Функция парсинга категорий (выполняется на странице)
async function parseCategories(parseImages = false) {
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

    // Ищем изображение если нужно
    let imageUrl = '';
    if (parseImages) {
      console.log(`\n🔍 Ищу изображение для "${text}"...`);
      console.log('Ссылка:', link.href);
      
      // СНАЧАЛА ищем изображение ВНУТРИ самой ссылки
      const imgsInLink = link.querySelectorAll('img');
      console.log(`  Найдено <img> внутри ссылки: ${imgsInLink.length}`);
      
      if (imgsInLink.length > 0) {
        imgsInLink.forEach((img, idx) => {
          console.log(`  Изображение #${idx + 1}:`);
          console.log(`    - src: ${img.src || 'нет'}`);
          console.log(`    - currentSrc: ${img.currentSrc || 'нет'}`);
          console.log(`    - data-src: ${img.getAttribute('data-src') || 'нет'}`);
          console.log(`    - data-lazy-src: ${img.getAttribute('data-lazy-src') || 'нет'}`);
          console.log(`    - srcset: ${img.getAttribute('srcset') || 'нет'}`);
          console.log(`    - Все атрибуты:`, Array.from(img.attributes).map(a => `${a.name}="${a.value}"`).join(', '));
        });
        
        for (const img of imgsInLink) {
          // Проверяем ВСЕ возможные атрибуты
          const allAttributes = Array.from(img.attributes);
          
          let imgSrc = img.currentSrc || 
                       img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original') ||
                       img.getAttribute('data-srcset') ||
                       img.getAttribute('srcset') ||
                       img.getAttribute('data-image') ||
                       img.getAttribute('data-url') ||
                       img.getAttribute('data-lazy') ||
                       '';
          
          // Ищем в любых data-* атрибутах
          if (!imgSrc) {
            for (const attr of allAttributes) {
              if ((attr.name.startsWith('data-') || attr.name.includes('src')) && 
                  attr.value && 
                  attr.value.length > 20 &&
                  (attr.value.includes('.jpg') || attr.value.includes('.png') || attr.value.includes('.webp') || attr.value.includes('/medias/'))) {
                imgSrc = attr.value;
                console.log(`    ✅ Нашел в атрибуте ${attr.name}: ${imgSrc}`);
                break;
              }
            }
          }
          
          // Если нашли srcset, берем первую ссылку
          if (imgSrc && imgSrc.includes(' ')) {
            imgSrc = imgSrc.split(' ')[0].split(',')[0];
          }
          
          // Пропускаем base64, пустые
          if (imgSrc && 
              !imgSrc.startsWith('data:') && 
              imgSrc.length > 10) {
            imageUrl = imgSrc;
            console.log(`  ✅ Выбрал изображение: ${imageUrl}`);
            break;
          }
        }
      }
      
      // Если не нашли в ссылке, ищем в родителе И в соседних элементах
      if (!imageUrl) {
        console.log('  ⚠️ В ссылке не нашел, ищу в родителе и соседних элементах...');
        
        // Находим ближайший общий контейнер (div, li и т.д.)
        const itemParent = link.closest('li, div[class*="item"], div[class*="card"], div[class*="product"], div[class*="category"], div[class*="thumb"], article, section');
        
        if (itemParent) {
          console.log('  Родительский контейнер:', itemParent.className);
          
          // Ищем ВСЕ изображения в контейнере (включая соседние ссылки)
          const imgs = itemParent.querySelectorAll('img');
          console.log(`  Найдено <img> в родительском контейнере: ${imgs.length}`);
          
          for (const img of imgs) {
            const allAttributes = Array.from(img.attributes);
            console.log(`    Проверяю img:`, img.getAttribute('title') || img.getAttribute('alt') || 'без названия');
            
            let imgSrc = img.currentSrc || 
                         img.src || 
                         img.getAttribute('data-src') || 
                         img.getAttribute('data-lazy-src') ||
                         img.getAttribute('data-original') ||
                         img.getAttribute('srcset') ||
                         img.getAttribute('data-image') ||
                         '';
            
            // Ищем в любых data-* атрибутах
            if (!imgSrc) {
              for (const attr of allAttributes) {
                if ((attr.name.startsWith('data-') || attr.name.includes('src')) && 
                    attr.value && 
                    attr.value.length > 20 &&
                    (attr.value.includes('.jpg') || attr.value.includes('.png') || attr.value.includes('.webp') || attr.value.includes('/medias/'))) {
                  imgSrc = attr.value;
                  console.log(`      ✅ Нашел в атрибуте ${attr.name}: ${imgSrc}`);
                  break;
                }
              }
            }
            
            if (imgSrc && imgSrc.includes(' ')) {
              imgSrc = imgSrc.split(' ')[0].split(',')[0];
            }
            
            if (imgSrc && 
                !imgSrc.startsWith('data:') && 
                imgSrc.length > 10) {
              imageUrl = imgSrc;
              console.log(`    ✅ ВЫБРАЛ это изображение из родителя: ${imgSrc}`);
              break;
            }
          }
        }
        
        // Если всё ещё не нашли, ищем в более широком родителе
        if (!imageUrl) {
          console.log('  ⚠️ Ещё не нашел, ищу в более широком родителе...');
          const widerParent = link.closest('div');
          if (widerParent) {
            const imgs = widerParent.querySelectorAll('img');
            console.log(`  Найдено <img> в широком родителе: ${imgs.length}`);
            
            for (const img of imgs) {
              let imgSrc = img.src || img.getAttribute('data-src') || img.currentSrc || '';
              
              if (imgSrc && imgSrc.includes(' ')) {
                imgSrc = imgSrc.split(' ')[0].split(',')[0];
              }
              
              if (imgSrc && 
                  !imgSrc.startsWith('data:') && 
                  imgSrc.length > 10) {
                imageUrl = imgSrc;
                console.log(`    ✅ ВЫБРАЛ из широкого родителя: ${imgSrc}`);
                break;
              }
            }
          }
        }
      }
      
      // Преобразуем относительные пути в абсолютные URL
      if (imageUrl) {
        const originalUrl = imageUrl;
        try {
          // Если путь начинается с /, добавляем домен
          if (imageUrl.startsWith('/')) {
            const currentDomain = window.location.origin;
            imageUrl = currentDomain + imageUrl;
          } 
          // Если путь начинается с //, добавляем протокол
          else if (imageUrl.startsWith('//')) {
            imageUrl = window.location.protocol + imageUrl;
          }
          // Проверяем что это валидный URL
          else if (!imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, window.location.href).href;
          }
          console.log(`  🔗 Преобразовано: ${originalUrl} → ${imageUrl}`);
        } catch (e) {
          console.error('  ❌ Ошибка преобразования URL изображения:', e);
        }
      }
      
      console.log(`📌 ИТОГО для "${text}": ${imageUrl ? '✅ НАЙДЕНО' : '❌ НЕ НАЙДЕНО'} - ${imageUrl || 'нет'}\n`);
    }

    // Сохраняем все ссылки
    if (!categoriesMap.has(url)) {
      categoriesMap.set(url, {
        name: text,
        url: url,
        image: imageUrl,
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
      const parentEl = category.element.closest('li, div[class*="item"], article, div');
      if (parentEl) {
        const childLinks = parentEl.querySelectorAll('a[href]');
        childLinks.forEach(childLink => {
          if (childLink !== category.element && !childLink.closest('[data-exclude-parse="true"]')) {
            const subText = childLink.textContent.trim();
            const subUrl = childLink.href;
            
            if (subText && subUrl && subUrl !== category.url) {
              const subcat = {
                name: subText,
                url: subUrl
              };
              
              // Ищем изображение для подкатегории если нужно
              if (parseImages) {
                // Сначала ищем внутри ссылки
                const imgInLink = childLink.querySelector('img');
                let subImage = '';
                
                if (imgInLink) {
                  subImage = imgInLink.currentSrc || imgInLink.src || imgInLink.getAttribute('data-src') || '';
                }
                
                // Если не нашли, ищем в родителе ссылки
                if (!subImage) {
                  const subLinkParent = childLink.closest('li, div[class*="item"], div[class*="thumb"], div');
                  if (subLinkParent) {
                    const imgs = subLinkParent.querySelectorAll('img');
                    for (const img of imgs) {
                      const imgSrc = img.currentSrc || img.src || img.getAttribute('data-src') || '';
                      if (imgSrc && !imgSrc.startsWith('data:') && imgSrc.length > 10) {
                        subImage = imgSrc;
                        break;
                      }
                    }
                  }
                }
                
                // Преобразуем относительные пути
                if (subImage) {
                  if (subImage.startsWith('/') && !subImage.startsWith('//')) {
                    subImage = window.location.origin + subImage;
                  } else if (subImage.startsWith('//')) {
                    subImage = window.location.protocol + subImage;
                  }
                  subcat.image = subImage;
                }
              }
              
              subcats.push(subcat);
            }
          }
        });
      }
    } catch(e) {
      console.error('Ошибка парсинга подкатегорий:', e);
    }

    const catData = {
      id: id++,
      name: category.name,
      url: category.url,
      subcategories: subcats,
      subcategoryCount: subcats.length
    };
    
    if (parseImages && category.image) {
      catData.image = category.image;
    }
    
    result.push(catData);
  });

  console.log('Итого категорий после обработки:', result.length);
  
  if (parseImages) {
    const withImages = result.filter(cat => cat.image).length;
    console.log(`Категорий с изображениями: ${withImages} из ${result.length}`);
  }

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    totalCategories: result.length,
    totalSubcategories: result.reduce((sum, cat) => sum + cat.subcategoryCount, 0),
    categories: result
  };
}

// НЕИСПОЛЬЗУЕМАЯ ГЛОБАЛЬНАЯ ФУНКЦИЯ УДАЛЕНА: parseDescriptionBySelector
// (логика перенесена внутрь parseProducts и fetchProductDetails как локальные функции)

// Функция парсинга товаров (обновленная с вашим селектором)
async function parseProducts(parseImages = false) {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  console.log('Начало парсинга товаров...');

  // Жестко исключаем навигацию
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

  excludeSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        el.setAttribute('data-exclude-product', 'true');
      });
    } catch (e) {}
  });

  // Агрессивная прокрутка для ленивой загрузки всех товаров
  const scrollHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
  
  // Прокручиваем пошагово, чтобы загрузить все товары
  for (let i = 0; i <= scrollSteps; i++) {
    window.scrollTo(0, (i * viewportHeight));
    await wait(300);
  }
  
  // Прокручиваем обратно вверх
  window.scrollTo(0, 0);
  await wait(500);
  
  // Ещё раз прокручиваем вниз и вверх для надёжности
  window.scrollTo(0, scrollHeight);
  await wait(500);
  window.scrollTo(0, 0);
  await wait(500);

  const productSelectors = [
    '[class*="product-card"]',
    '[class*="product-item"]',
    '[class*="product-tile"]',
    '[class*="product__item"]',
    '[class*="product-box"]',
    '[class*="product-container"]',
    '[class*="product-wrapper"]',
    '[class*="product"] li',
    'li[class*="product"]',
    '[data-product-id]',
    '[data-product]',
    '[data-sku]',
    '[data-testid*="product"]',
    '.product',
    'article',
    '[class*="grid__item"]',
    '[class*="item-card"]',
    '[class*="card"]',
    '[class*="tile"]',
    '[class*="item"]',
    '[role="article"]',
    '[class*="result"]',
    '[class*="listing"]'
  ];

  const productsMap = new Map();
  const seenElements = new Set();

  const resolveImageUrl = (src) => {
    if (!src) return '';
    try {
      if (src.startsWith('//')) {
        return window.location.protocol + src;
      }
      return new URL(src, window.location.href).href;
    } catch (e) {
      return src;
    }
  };

  // Функция валидации изображений
  const isValidImage = (src) => {
    if (!src || typeof src !== 'string') return false;
    
    const trimmed = src.trim();
    if (trimmed.length < 5) return false;
    
    if (trimmed.startsWith('data:image/svg+xml')) {
      return trimmed.length > 50;
    }
    if (trimmed.startsWith('data:') && trimmed.length < 100) {
      return false;
    }
    
    const lowerSrc = trimmed.toLowerCase();
    const strictPlaceholderPatterns = [
      '1x1.gif',
      'blank.gif',
      'spacer.gif',
      'clear.gif',
      'pixel.gif',
      '0x0'
    ];
    
    if (strictPlaceholderPatterns.some(pattern => lowerSrc.endsWith(pattern))) {
      if (!lowerSrc.startsWith('http://') && !lowerSrc.startsWith('https://')) {
        return false;
      }
    }
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const hasImageExtension = imageExtensions.some(ext => lowerSrc.includes(ext));
    
    if (hasImageExtension || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('//')) {
      return true;
    }
    
    return false;
  };

  const extractText = (element, selectors) => {
    for (const selector of selectors) {
      const found = element.querySelector(selector);
      if (found) {
        let fullText = '';
        if (found.innerText) {
          fullText = found.innerText.trim();
        } else {
          const walker = document.createTreeWalker(
            found,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          const textNodes = [];
          let node;
          while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text) {
              textNodes.push(text);
            }
          }
          fullText = textNodes.join(' ').trim();
        }
        
        if (fullText.length > 1) {
          return fullText;
        }
      }
    }
    return '';
  };

  const addProduct = (product) => {
    if (!product) return;
    
    if (!product.url) {
      const key = product.name ? `no-url-${product.name}-${productsMap.size}` : `no-url-${productsMap.size}`;
      if (!productsMap.has(key)) {
        productsMap.set(key, product);
      }
      return;
    }
    
    const urlKey = product.url;
    const existing = productsMap.get(urlKey);
    
    if (existing && existing.name !== product.name) {
      const uniqueKey = `${urlKey}-${productsMap.size}`;
      productsMap.set(uniqueKey, product);
    } else if (!existing) {
      productsMap.set(urlKey, product);
    }
  };

  // Функция для извлечения описания ТОЛЬКО из элементов ProductBasicDetails с li
  const extractDescriptionFromElement = (element) => {
    if (!element) return '';

    // Ищем только по классу ProductBasicDetails
    const productBasicDetailsSelectors = [
      '[class*="ProductBasicDetails"][class*="StyledList"]',
      '[class*="ProductBasicDetails"]',
      'ul[class*="ProductBasicDetails"]'
    ];

    for (const selector of productBasicDetailsSelectors) {
      const descriptionElement = element.querySelector(selector);
      if (descriptionElement) {
        // Ищем все <li> внутри (элементы с ::marker)
        const listItems = descriptionElement.querySelectorAll('li');
        if (listItems.length > 0) {
          const descriptions = [];
          listItems.forEach(li => {
            const text = (li.innerText || li.textContent || '').trim();
            if (text && text.length > 0) {
              descriptions.push(text);
            }
          });
          if (descriptions.length > 0) {
            return descriptions.join('\n').trim();
          }
        }
      }
    }

    // Если не нашли - возвращаем пустую строку
    return '';
  };

  productSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`🔍 Селектор "${selector}" → найдено ${elements.length}`);
    elements.forEach((element) => {
      if (seenElements.has(element)) {
        return;
      }

      if (element.closest('[data-exclude-product="true"]')) {
        return;
      }

      if (element.textContent.replace(/\s+/g, ' ').trim().length < 3) {
        return;
      }

      seenElements.add(element);

      const link = element.querySelector('a[href]');
      const rawUrl = link ? link.getAttribute('href') : element.getAttribute('data-url');
      let productUrl = '';
      try {
        productUrl = rawUrl ? new URL(rawUrl, window.location.href).href : '';
      } catch (e) {
        productUrl = rawUrl || '';
      }

      if (!productUrl) {
        return;
      }

      const name = extractText(element, ['[class*="name"]', '[class*="title"]', 'h2', 'h3', 'h4', '.product-name']) || (link ? link.textContent.trim() : '');
      if (!name || name.length < 1 || name.length > 300) {
        return;
      }

      const price = extractText(element, ['[class*="price"]', '.price', '[data-price]', '.product-price']);

      // Парсим описание ТОЛЬКО из ProductBasicDetails li элементов
      const description = extractDescriptionFromElement(element);

      // Добавляем товар даже если нет цены и описания
      if (!price && !description) {
        const textContent = element.textContent.replace(/\s+/g, ' ').trim();
        if (textContent.length < 10) {
          addProduct({
            name,
            url: productUrl,
            price: '',
            description: '',
            image: '',
            images: []
          });
          return;
        }
      }

      const imagesSet = new Set();
      let primaryImage = '';
      const imageElements = element.querySelectorAll('img');

      imageElements.forEach((img) => {
        let src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('data-image') || '';
        if (!src && img.getAttribute('srcset')) {
          src = img.getAttribute('srcset').split(',')[0].trim().split(' ')[0];
        }
        
        if (src && isValidImage(src)) {
          const resolved = resolveImageUrl(src);
          
          if (resolved && isValidImage(resolved)) {
          if (!primaryImage) {
            primaryImage = resolved;
          }
          if (parseImages) {
            imagesSet.add(resolved);
            }
          }
        }
      });

      if (!parseImages && primaryImage && isValidImage(primaryImage)) {
        imagesSet.add(primaryImage);
      }

      const validImages = Array.from(imagesSet).filter(img => img && isValidImage(img));
      const finalPrimaryImage = primaryImage && isValidImage(primaryImage) ? primaryImage : (validImages.length > 0 ? validImages[0] : '');

      addProduct({
        name,
        url: productUrl,
        price: price.trim(),
        description: description.trim(),
        image: finalPrimaryImage || '',
        images: validImages
      });
    });
  });

  // Резервный парсинг: сканируем все ссылки и ищем те, что похожи на товары
  if (productsMap.size < 10) {
    console.log('⚠️ Основные селекторы нашли мало товаров, запускаю резервный поиск по ссылкам');
    const allLinks = document.querySelectorAll('a[href]');
    const productKeywords = ['product', 'item', 'goods', 'catalog', 'shop', 'sku'];

    allLinks.forEach(link => {
      if (link.closest('[data-exclude-product="true"]')) {
        return;
      }
      const text = link.textContent.trim();
      const href = link.getAttribute('href');
      if (!text || text.length < 2 || !href || href.includes('#')) {
        return;
      }
      const lowerHref = href.toLowerCase();
      if (!productKeywords.some(word => lowerHref.includes(word))) {
        return;
      }
      let url;
      try {
        url = new URL(href, window.location.href).href;
      } catch (e) {
        url = href;
      }
      if (!url || productsMap.has(url)) {
        return;
      }

      // Проверяем, содержит ли родитель информацию о цене/описании
      const parent = link.closest('[class*="product"], [class*="item"], article, li, div');
      if (!parent) {
        return;
      }
      let price = '';
      let description = '';
      let primaryImage = '';
      const imagesSet = new Set();

      price = extractText(parent, ['[class*="price"]', '.price', '[data-price]', '.product-price']);
      
      // ИСПОЛЬЗУЕМ УПРОЩЕННЫЙ ПАРСИНГ ОПИСАНИЯ
      description = extractDescriptionFromElement(parent);

      if (!price && !description && parent.textContent.replace(/\s+/g, ' ').trim().length < 15) {
        return;
      }

      parent.querySelectorAll('img').forEach(img => {
        let src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
        if (!src && img.getAttribute('srcset')) {
          src = img.getAttribute('srcset').split(',')[0].trim().split(' ')[0];
        }
        
        if (src && isValidImage(src)) {
          const resolved = resolveImageUrl(src);
          
          if (resolved && isValidImage(resolved)) {
          if (!primaryImage) {
            primaryImage = resolved;
          }
          if (parseImages) {
            imagesSet.add(resolved);
            }
          }
        }
      });

      if (!parseImages && primaryImage && isValidImage(primaryImage)) {
        imagesSet.add(primaryImage);
      }

      const validImages = Array.from(imagesSet).filter(img => img && isValidImage(img));
      const finalPrimaryImage = primaryImage && isValidImage(primaryImage) ? primaryImage : (validImages.length > 0 ? validImages[0] : '');

      addProduct({
        name: text,
        url,
        price: price.trim(),
        description: description.trim(),
        image: finalPrimaryImage || '',
        images: validImages
      });
    });
  }

  if (productsMap.size === 0) {
    console.log('⚠️ Парсер не смог определить товары на странице');
  }

  const products = Array.from(productsMap.values()).map((product, index) => ({
    id: index + 1,
    ...product
  }));

  const totalImages = products.reduce((sum, product) => {
    if (product.images && product.images.length > 0) {
      return sum + product.images.length;
    }
    return sum + (product.image ? 1 : 0);
  }, 0);

  console.log(`Итого товаров: ${products.length}`);
  console.log(`Изображений (произвольных): ${totalImages}`);

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    totalImages: totalImages,
    products: products
  };
}

// Функция для парсинга описания с переходом на страницу товара (выполняется JS)
async function fetchProductDetailsWithJS(tab, url, parseImages = false) {
  try {
    if (!url) {
      return { description: '', images: [] };
    }

    console.log(`  🌐 Переход на страницу товара: ${url}`);
    
    // Переходим на страницу товара
    await chrome.tabs.update(tab.id, { url: url });
    
    // Ждем полной загрузки страницы
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    // Дополнительная пауза для загрузки JS контента (3 секунды)
    console.log(`  ⏳ Ожидание загрузки JS...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Парсим описание на странице после загрузки JS
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (parseImages) => {
        // Парсим ЦЕНУ из MuiTypography
        let price = '';
        const priceSelectors = [
          '[data-testid*="dealerPrice"]',
          '[data-testid*="price"]',
          '[class*="MuiTypography-h1"]',
          '[class*="MuiTypography"][class*="price"]',
          '[class*="price"]'
        ];
        
        for (const selector of priceSelectors) {
          const priceElement = document.querySelector(selector);
          if (priceElement) {
            const priceText = (priceElement.innerText || priceElement.textContent || '').trim();
            if (priceText && priceText.length > 0) {
              price = priceText;
              console.log(`✅ Найдена цена: ${price} (селектор: ${selector})`);
              break;
            }
          }
        }
        
        // Парсим ХАРАКТЕРИСТИКИ товара (Product Dimensions)
        const specifications = {
          weight: null,
          height: null,
          width: null,
          length: null,
          volume: null
        };
        
        // Ищем все элементы с характеристиками
        const specContainers = document.querySelectorAll('[class*="MuiGrid-container"][class*="MuiGrid-item"]');
        specContainers.forEach(container => {
          // Ищем пары название-значение
          const labelElement = container.querySelector('[class*="css-mf42sb"]');
          const valueElement = container.querySelector('[class*="css-zyb0l3"]');
          
          if (labelElement && valueElement) {
            const label = (labelElement.innerText || labelElement.textContent || '').trim().toLowerCase();
            const value = (valueElement.innerText || valueElement.textContent || '').trim();
            
            if (value) {
              if (label.includes('weight')) {
                specifications.weight = value;
              } else if (label.includes('height')) {
                specifications.height = value;
              } else if (label.includes('width')) {
                specifications.width = value;
              } else if (label.includes('length')) {
                specifications.length = value;
              } else if (label.includes('volume')) {
                specifications.volume = value;
              }
            }
          }
        });
        
        const hasSpecs = Object.values(specifications).some(v => v !== null);
        if (hasSpecs) {
          console.log(`✅ Найдены характеристики:`, specifications);
        }
        
        // Парсим описание ТОЛЬКО из ProductBasicDetails li элементов
        let description = '';
        const productBasicDetailsSelectors = [
          '[class*="ProductBasicDetails"][class*="StyledList"]',
          'ul[class*="ProductBasicDetails"]',
          '[class*="ProductBasicDetails"]'
        ];

        for (const selector of productBasicDetailsSelectors) {
          const descriptionElement = document.querySelector(selector);
          
          if (descriptionElement) {
            console.log(`✅ Найден элемент описания: ${selector}`);
            
            const listItems = descriptionElement.querySelectorAll('li');
            if (listItems.length > 0) {
              const descriptions = [];
              listItems.forEach(li => {
                const text = (li.innerText || li.textContent || '').trim();
                if (text && text.length > 0) {
                  descriptions.push(text);
                }
              });
              if (descriptions.length > 0) {
                description = descriptions.join('\n').trim();
                console.log(`✅ Извлечено ${descriptions.length} пунктов, длина: ${description.length}`);
                break;
              }
            }
          }
        }
        
        // Парсим изображения ТОЛЬКО из карусели товара
        const images = [];
        if (parseImages) {
          const seenImages = new Set();
          const seenFilenames = new Set(); // Дедупликация по имени файла
          
          // Ищем карусель изображений товара
          const carouselSelectors = [
            '[class*="ImageCarousel"]',
            '[class*="imageCarousel"]',
            '[class*="product-gallery"]',
            '[class*="product-images"]',
            '[class*="ProductGallery"]'
          ];
          
          let carouselContainer = null;
          for (const selector of carouselSelectors) {
            carouselContainer = document.querySelector(selector);
            if (carouselContainer) {
              console.log(`✅ Найдена карусель изображений: ${selector}`);
              break;
            }
          }
          
          // Проверяем, является ли элемент SVG плейсхолдером
          const isPlaceholder = (element) => {
            if (!element) return false;
            
            // Проверяем родительские элементы на наличие data-testid="DefaultImageContainer"
            let parent = element.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const testId = parent.getAttribute('data-testid');
              if (testId && testId.includes('DefaultImageContainer')) {
                console.log('🔍 Найден плейсхолдер: DefaultImageContainer');
                return true;
              }
              
              // Проверяем наличие SVG с rect/path (типичный placeholder)
              if (parent.tagName === 'svg' || parent.querySelector('svg')) {
                const svg = parent.tagName === 'svg' ? parent : parent.querySelector('svg');
                if (svg && (svg.querySelector('rect') || svg.querySelector('path'))) {
                  const viewBox = svg.getAttribute('viewBox');
                  // SVG placeholder обычно имеет viewBox и rect/path элементы
                  if (viewBox) {
                    console.log('🔍 Найден SVG плейсхолдер');
                    return true;
                  }
                }
              }
              
              parent = parent.parentElement;
            }
            
            // Проверяем сам элемент img на data:image/svg
            const src = element.currentSrc || element.src || '';
            if (src.startsWith('data:image/svg+xml')) {
              const svgContent = decodeURIComponent(src);
              // Если SVG содержит много путей и rect - это placeholder
              if (svgContent.includes('rect') && svgContent.includes('fill=')) {
                console.log('🔍 Найден data:image/svg плейсхолдер');
                return true;
              }
            }
            
            return false;
          };
          
          // Если нашли карусель - парсим только из неё
          if (carouselContainer) {
            const allCarouselImages = Array.from(carouselContainer.querySelectorAll('img'));
            
            // Проверяем наличие плейсхолдеров
            const hasPlaceholder = allCarouselImages.some(img => isPlaceholder(img));
            if (hasPlaceholder) {
              console.log('⚠️ Обнаружен плейсхолдер в карусели → ТОЛЬКО placeholder, другие фото НЕ парсим');
              images.push('placeholder');
              // ВАЖНО: Если есть плейсхолдер - НЕ парсим остальные изображения!
            } else {
              // Только если НЕТ плейсхолдера - парсим реальные изображения
              
              // Фильтруем миниатюры и маленькие изображения
              const mainImages = allCarouselImages.filter(img => {
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                
                // Пропускаем миниатюры (обычно < 100px)
                if ((width > 0 && width < 100) || (height > 0 && height < 100)) {
                  return false;
                }
                
                // Пропускаем элементы с классами thumbnail, thumb, preview, mini
                const imgClass = (img.className || '').toLowerCase();
                if (imgClass.includes('thumb') || imgClass.includes('preview') || 
                    imgClass.includes('mini') || imgClass.includes('small')) {
                  return false;
                }
                
                return true;
              });
              
              console.log(`🔍 Всего img элементов в карусели: ${allCarouselImages.length}, после фильтра миниатюр: ${mainImages.length}`);
              
              mainImages.forEach(img => {
                const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
                if (src && src.length > 10 && !src.includes('1x1')) {
                  try {
                    const resolved = new URL(src, window.location.href).href;
                    
                    // Извлекаем имя файла для дедупликации
                    const urlParts = resolved.split('?')[0].split('/');
                    const filename = urlParts[urlParts.length - 1];
                    
                    // Проверяем уникальность по полному URL И по имени файла
                    if (!seenImages.has(resolved) && !seenFilenames.has(filename)) {
                      seenImages.add(resolved);
                      seenFilenames.add(filename);
                      images.push(resolved);
                    }
                  } catch (e) {
                    // ignore
                  }
                }
              });
              console.log(`📷 Найдено уникальных изображений: ${images.length}`);
            }
          } else {
            // Если карусели нет - используем старую логику (все img на странице)
            console.log(`⚠️ Карусель не найдена, парсим все изображения`);
            const allImages = Array.from(document.querySelectorAll('img'));
            
            // Проверяем наличие плейсхолдеров
            const hasPlaceholder = allImages.some(img => isPlaceholder(img));
            if (hasPlaceholder) {
              console.log('⚠️ Обнаружен плейсхолдер на странице → ТОЛЬКО placeholder, другие фото НЕ парсим');
              images.push('placeholder');
              // ВАЖНО: Если есть плейсхолдер - НЕ парсим остальные изображения!
            } else {
              // Только если НЕТ плейсхолдера - парсим реальные изображения
              
              // Фильтруем миниатюры
              const mainImages = allImages.filter(img => {
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                if ((width > 0 && width < 100) || (height > 0 && height < 100)) {
                  return false;
                }
                const imgClass = (img.className || '').toLowerCase();
                if (imgClass.includes('thumb') || imgClass.includes('preview') || 
                    imgClass.includes('mini') || imgClass.includes('small')) {
                  return false;
                }
                return true;
              });
              
              mainImages.forEach(img => {
                const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
                if (src && src.length > 10 && !src.includes('1x1')) {
                  try {
                    const resolved = new URL(src, window.location.href).href;
                    const urlParts = resolved.split('?')[0].split('/');
                    const filename = urlParts[urlParts.length - 1];
                    
                    if (!seenImages.has(resolved) && !seenFilenames.has(filename)) {
                      seenImages.add(resolved);
                      seenFilenames.add(filename);
                      images.push(resolved);
                    }
                  } catch (e) {
                    // ignore
                  }
                }
              });
            }
          }
        }
        
        return { price, description, images, specifications };
      },
      args: [parseImages]
    });
    
    if (results && results[0] && results[0].result) {
      console.log(`  ✅ Описание получено, длина: ${results[0].result.description.length}`);
      return results[0].result;
    }
    
    return { description: '', images: [] };
  } catch (error) {
    console.error(`  ❌ Ошибка при парсинге страницы ${url}:`, error);
    return { description: '', images: [] };
  }
}

// СТАРАЯ функция с fetch (оставлена для совместимости, но не используется)
async function fetchProductDetails(url, parseImages = false) {
  try {
    if (!url) {
      return { description: '', images: [] };
    }

    console.log(`  🌐 Загрузка товара: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Парсим описание ТОЛЬКО из ProductBasicDetails li элементов
    let description = '';
    
    const productBasicDetailsSelectors = [
      '[class*="ProductBasicDetails"][class*="StyledList"]',
      'ul[class*="ProductBasicDetails"]',
      '[class*="ProductBasicDetails"]'
    ];

    for (const selector of productBasicDetailsSelectors) {
      const descriptionElement = doc.querySelector(selector);
      
      if (descriptionElement) {
        console.log(`✅ Найден элемент описания: ${selector}`);
        
        const listItems = descriptionElement.querySelectorAll('li');
        if (listItems.length > 0) {
          const descriptions = [];
          listItems.forEach(li => {
            const text = (li.innerText || li.textContent || '').trim();
            if (text && text.length > 0) {
              descriptions.push(text);
            }
          });
          if (descriptions.length > 0) {
            description = descriptions.join('\n').trim();
            console.log(`✅ Извлечено ${descriptions.length} пунктов, длина: ${description.length}`);
        break;
      }
    }
      }
    }

    const imagesSet = new Set();

    // Функция валидации изображений для fetchProductDetails
    const isValidImageUrl = (src) => {
      if (!src || typeof src !== 'string') return false;
      
      const trimmed = src.trim();
      
      // Проверяем минимальную длину
      if (trimmed.length < 10) return false;
      
      // Пропускаем data: URI
      if (trimmed.startsWith('data:')) return false;
      
      // Пропускаем placeholder изображения
      const lowerSrc = trimmed.toLowerCase();
      const placeholderPatterns = [
        'placeholder',
        '1x1',
        'blank',
        'transparent',
        'spacer',
        'empty',
        'no-image',
        'noimage',
        'default',
        'loading',
        'lazy',
        'pixel',
        'clear.gif',
        'spacer.gif',
        '1px',
        '0x0'
      ];
      
      if (placeholderPatterns.some(pattern => lowerSrc.includes(pattern))) {
        if (!lowerSrc.startsWith('http://') && !lowerSrc.startsWith('https://')) {
          return false;
        }
      }
      
      // Проверяем расширения изображений
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const hasImageExtension = imageExtensions.some(ext => lowerSrc.includes(ext));
      
      if (!hasImageExtension && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
        return false;
      }
      
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/') && !trimmed.startsWith('//')) {
        return false;
      }
      
      return true;
    };

    const addImage = (src) => {
      if (!src || !isValidImageUrl(src)) return;
      
      try {
        let resolvedUrl;
        if (src.startsWith('//')) {
          resolvedUrl = new URL(url).protocol + src;
        } else {
          resolvedUrl = new URL(src, url).href;
        }
        
        // Проверяем валидность после разрешения URL
        if (isValidImageUrl(resolvedUrl)) {
          imagesSet.add(resolvedUrl);
        }
      } catch (e) {
        // Если не удалось разрешить URL, но исходный валиден, добавляем его
        if (isValidImageUrl(src)) {
        imagesSet.add(src);
        }
      }
    };

    if (parseImages) {
      const gallerySelectors = [
        '[class*="gallery"] img',
        '[class*="carousel"] img',
        '.product-images img',
        '.product-media img',
        'img[data-zoom-image]',
        'img[data-large-image]'
      ];

      gallerySelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(img => {
          const src = img.getAttribute('data-zoom-image') || img.getAttribute('data-large-image') || img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (src && isValidImageUrl(src)) {
            addImage(src);
          }
        });
      });

      // Парсим все изображения, но только валидные
      doc.querySelectorAll('img').forEach(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src && isValidImageUrl(src)) {
          addImage(src);
        }
      });

      // LD+JSON
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const json = JSON.parse(script.textContent.trim());
          const images = [];
          if (json) {
            if (Array.isArray(json)) {
              json.forEach(item => {
                if (item && item.image) {
                  if (Array.isArray(item.image)) {
                    item.image.forEach(addImage);
                  } else {
                    addImage(item.image);
                  }
                }
              });
            } else if (json.image) {
              if (Array.isArray(json.image)) {
                json.image.forEach(addImage);
              } else {
                addImage(json.image);
              }
            }
          }
        } catch (e) {
          // игнорируем ошибки
        }
      });
    }

    // Фильтруем финальный список изображений, убирая пустые и невалидные
    const images = Array.from(imagesSet)
      .filter(img => img && isValidImageUrl(img))
      .filter((img, index, arr) => arr.indexOf(img) === index); // Убираем дубликаты

    return {
      description: description,
      images: images
    };
  } catch (error) {
    console.error('❌ Ошибка загрузки товара:', error);
    return { description: '', images: [] };
  }
}

// Отображение результатов
function displayResults(data) {
  const resultsDiv = document.getElementById('results');
  const statsDiv = document.getElementById('stats');

  resultsDiv.innerHTML = '';
  statsDiv.innerHTML = '';

  if (!data) {
    return;
  }

  if (parsedDataType === 'products') {
    renderProductResults(data, resultsDiv, statsDiv);
  } else {
    renderCategoryResults(data, resultsDiv, statsDiv);
  }
}

function renderCategoryResults(data, resultsDiv, statsDiv) {
  statsDiv.innerHTML = `
    <div><strong>URL:</strong> ${data.url}</div>
    <div><strong>Всего категорий:</strong> ${data.totalCategories}</div>
    <div><strong>Всего подкатегорий:</strong> ${data.totalSubcategories}</div>
    <div><strong>Время парсинга:</strong> ${new Date(data.timestamp).toLocaleString('ru-RU')}</div>
  `;

  if (!data.categories || data.categories.length === 0) {
    resultsDiv.innerHTML = '<p style="color: #666;">Категории не найдены</p>';
    return;
  }

  data.categories.forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-item';
    
    let html = `
      ${category.image ? `<img src="${category.image}" alt="${category.name}" style="max-width: 100%; height: auto; border-radius: 4px; margin-bottom: 8px;">` : ''}
      <div class="category-name">${category.name}</div>
      ${category.url ? `<div class="category-url">${category.url}</div>` : ''}
    `;

    if (category.subcategories && category.subcategories.length > 0) {
      html += `<div class="subcategories">`;
      category.subcategories.forEach(sub => {
        html += `
          <div class="subcategory-item">
            ${sub.image ? `<img src="${sub.image}" alt="${sub.name}" style="max-width: 80px; height: auto; border-radius: 4px; margin-bottom: 4px;">` : ''}
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

function renderProductResults(data, resultsDiv, statsDiv) {
  const totalProducts = data.totalProducts || (data.products ? data.products.length : 0);
  const totalImages = data.totalImages ?? (data.products ? data.products.reduce((sum, product) => {
    if (product.images && product.images.length > 0) {
      return sum + product.images.length;
    }
    return sum + (product.image ? 1 : 0);
  }, 0) : 0);

  statsDiv.innerHTML = `
    <div><strong>URL:</strong> ${data.url}</div>
    <div><strong>Всего товаров:</strong> ${totalProducts}</div>
    <div><strong>Всего изображений:</strong> ${totalImages}</div>
    <div><strong>Время парсинга:</strong> ${new Date(data.timestamp).toLocaleString('ru-RU')}</div>
  `;

  if (!data.products || data.products.length === 0) {
    resultsDiv.innerHTML = '<p style="color: #666;">Товары не найдены</p>';
    return;
  }

  data.products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product-item';

    const firstImage = product.images && product.images.length > 0 ? product.images[0] : (product.image || '');
    const additionalImages = product.images && product.images.length > 0
      ? product.images.slice(1)
      : [];

    let html = '<div class="product-header">';
    if (product.name) {
      html += `<div class="product-name">${product.name}</div>`;
    }
    if (product.price) {
      html += `<div class="product-price">${product.price}</div>`;
    }
    if (product.url) {
      html += `<div class="product-url">${product.url}</div>`;
    }
    html += '</div>';

    if (product.description) {
      html += `<div class="product-description">${product.description}</div>`;
    }

    if (firstImage) {
      html += '<div class="product-images">';
      html += `<img src="${firstImage}" alt="${product.name}">`;
      additionalImages.forEach(img => {
        html += `<img src="${img}" alt="${product.name}">`;
      });
      html += '</div>';
    }

    productDiv.innerHTML = html;
    resultsDiv.appendChild(productDiv);
  });
}

// Конвертация в CSV
function convertToCSV(data) {
  if (parsedDataType === 'products') {
    return convertProductsToCSV(data);
  }
  return convertCategoriesToCSV(data);
}

function convertCategoriesToCSV(data) {
  let csv = 'ID,Категория,URL категории,Изображение категории,Подкатегория,URL подкатегории,Изображение подкатегории\n';
  
  data.categories.forEach(category => {
    const catImage = category.image || '';
    
    if (category.subcategories && category.subcategories.length > 0) {
      category.subcategories.forEach(sub => {
        const subImage = sub.image || '';
        csv += `${category.id},"${escapeCSV(category.name)}","${category.url}","${catImage}","${escapeCSV(sub.name)}","${sub.url}","${subImage}"\n`;
      });
    } else {
      csv += `${category.id},"${escapeCSV(category.name)}","${category.url}","${catImage}","","",""\n`;
    }
  });
  
  return csv;
}

function convertProductsToCSV(data) {
  let csv = 'ID,Товар,URL,Цена,Описание,Изображения\n';
  
  data.products.forEach(product => {
    const images = product.images && product.images.length > 0
      ? product.images.join(' | ')
      : (product.image || '');
    csv += `${product.id},"${escapeCSV(product.name || '')}","${product.url || ''}","${escapeCSV(product.price || '')}","${escapeCSV(product.description || '')}","${escapeCSV(images)}"\n`;
  });
  
  return csv;
}

function escapeCSV(str) {
  if (!str) return '';
  return str.replace(/"/g, '""');
}

// Конвертация в TXT
function convertToTXT(data) {
  if (parsedDataType === 'products') {
    return convertProductsToTXT(data);
  }
  return convertCategoriesToTXT(data);
}

function convertCategoriesToTXT(data) {
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

function convertProductsToTXT(data) {
  let txt = '';
  
  data.products.forEach(product => {
    txt += `${product.name || 'Без названия'}\n`;
    if (product.price) {
      txt += `  Цена: ${product.price}\n`;
    }
    if (product.url) {
      txt += `  URL: ${product.url}\n`;
    }
    if (product.description) {
      txt += `  Описание: ${product.description}\n`;
    }
    if (product.images && product.images.length > 0) {
      txt += '  Изображения:\n';
      product.images.forEach(img => {
        txt += `    - ${img}\n`;
      });
    } else if (product.image) {
      txt += `  Изображение: ${product.image}\n`;
    }
    txt += '\n';
  });
  
  return txt;
}

// Функция для очистки имени файла
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Удаляем недопустимые символы
    .replace(/\s+/g, ' ') // Оставляем пробелы как есть
    .trim()
    .substring(0, 100); // Увеличил лимит до 100 символов
}

// Функция для транслитерации (создание screen_name)
function transliterate(str) {
  const ru = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  return str
    .toLowerCase()
    .split('')
    .map(char => ru[char] || char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Функция для генерации имени файла фото (формат: /storage/YYYY/MMDD/hash.jpg)
function generatePhotoPath(imageUrl, productId) {
  // Если это плейсхолдер, возвращаем "placeholder"
  if (imageUrl === 'placeholder') {
    return 'placeholder';
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePath = `${year}/${month}${day}`;
  
  // Генерируем хеш из URL или используем productId
  // Формат хеша: 8 символов (буквы и цифры), как в примере: 5c2660a6f2
  let hash = '';
  if (imageUrl) {
    // Создаем хеш из URL и productId
    const hashString = imageUrl + String(productId);
    // Используем base64 и берем только буквы и цифры, затем первые 8 символов
    hash = btoa(hashString)
      .replace(/[^a-z0-9]/gi, '')
      .substring(0, 10)
      .toLowerCase();
    
    // Если хеш слишком короткий, дополняем
    while (hash.length < 8) {
      hash += Math.random().toString(36).substring(2, 3);
    }
    hash = hash.substring(0, 10); // Берем 10 символов как в примере (5c2660a6f2)
  } else {
    hash = btoa(String(productId))
      .replace(/[^a-z0-9]/gi, '')
      .substring(0, 10)
      .toLowerCase();
    while (hash.length < 8) {
      hash += Math.random().toString(36).substring(2, 3);
    }
    hash = hash.substring(0, 10);
  }
  
  return `/storage/${datePath}/${hash}.jpg`;
}

// Функция для генерации пути фото категории (формат: /storage/YYYY/MMDD/003.jpg)
// Где MMDD - месяц и день без разделителя (например: 1108 для 11 ноября)
function generateCategoryPhotoPath(categoryId, isSubcategory = false) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePath = `${year}/${month}${day}`; // Формат: 2025/1108 (год/месяц+день)
  
  // Для категорий используем формат с нумерацией: 001.jpg, 002.jpg и т.д.
  // Можно использовать порядковый номер категории
  const photoNumber = String(categoryId).padStart(3, '0');
  
  return `/storage/${datePath}/${photoNumber}.jpg`;
}

// Функция для парсинга цены в копейки/центы (INT)
function parsePrice(priceStr) {
  if (!priceStr || priceStr.trim() === '') return 0;
  
  // Удаляем все кроме цифр и точки/запятой
  const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
  const price = parseFloat(cleaned);
  
  if (isNaN(price)) return 0;
  
  // Конвертируем в копейки/центы (умножаем на 100 и округляем ВВЕРХ)
  return Math.ceil(price * 100);
}

// Функция для извлечения SKU из названия или URL
function extractSKU(name, url) {
  // Ищем паттерны типа "TY26871", "SKU123", "CODE-456" и т.д.
  const skuPatterns = [
    /[A-Z]{2}[0-9]{4,}/,        // Паттерн типа TY26871
    /[A-Z]{2,}[0-9A-Z]{3,}/,    // Буквы + цифры/буквы
    /[A-Z]+[0-9]+[A-Z]*/,       // Буквы + цифры
    /[0-9]+[A-Z]+[0-9]*/        // Цифры + буквы
  ];
  
  // Сначала проверяем название
  for (const pattern of skuPatterns) {
    const match = name.match(pattern);
    if (match && match[0].length >= 4 && match[0].length <= 20) {
      return match[0];
    }
  }
  
  // Потом проверяем URL
  if (url) {
    const urlParts = url.split('/');
    for (const part of urlParts) {
      for (const pattern of skuPatterns) {
        const match = part.match(pattern);
        if (match && match[0].length >= 4 && match[0].length <= 20) {
          return match[0];
        }
      }
    }
  }
  
  // Если ничего не нашли, генерируем из названия
  return transliterate(name).substring(0, 20).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SKU' + Date.now();
}

// Функция для очистки названия от артикула
function cleanProductName(name, sku) {
  if (!name) return '';
  
  // Удаляем артикул и все что перед двоеточием
  let cleaned = name;
  
  // Удаляем "SKU: название"
  if (sku && name.includes(sku)) {
    cleaned = cleaned.replace(new RegExp(`${sku}\\s*:?\\s*`, 'gi'), '');
  }
  
  // Удаляем паттерны типа "TY26871: "
  cleaned = cleaned.replace(/^[A-Z]{2}[0-9]{4,}\s*:\s*/i, '');
  cleaned = cleaned.replace(/^[A-Z0-9]+\s*:\s*/i, '');
  
  return cleaned.trim();
}

// Функция для экранирования SQL строк
function escapeSQL(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// Конвертация в SQL миграцию
function convertToSQL(data, dataType = 'products') {
  if (dataType === 'categories') {
    return convertCategoriesToSQL(data);
  }
  
  if (!data || !data.products || data.products.length === 0) {
    return '-- Нет товаров для экспорта\n';
  }

  const now = Math.floor(Date.now() / 1000); // Unix timestamp
  let sql = `-- phpMyAdmin SQL Dump
-- Generated by Category Parser Extension
-- Generation Time: ${new Date().toLocaleString('ru-RU')}

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Dumping data for table \`products\`
--

INSERT INTO \`products\` (\`product_id\`, \`category_id\`, \`status_id\`, \`sort_id\`, \`sku_code\`, \`title\`, \`screen_name\`, \`photo\`, \`price_whosale\`, \`description\`, \`description_translated\`, \`created\`, \`updated\`) VALUES
`;

  const productValues = [];
  const photoValues = [];
  let productId = 1;
  let photoId = 1;

  data.products.forEach((product) => {
    const sku = extractSKU(product.name || '', product.url || '');
    const cleanName = cleanProductName(product.name || '', sku);
    const screenName = transliterate(cleanName || 'product-' + productId);
    const price = parsePrice(product.price || '');
    const photo = product.image || (product.images && product.images.length > 0 ? product.images[0] : '');
    const photoPath = photo ? generatePhotoPath(photo, productId) : '';
    
    // Цена в копейках (INT) или 0
    const priceWhosale = price || 0;
    
    // Переведенное описание (если есть)
    const descriptionTranslated = product.descriptionTranslated || '';
    
    productValues.push(
      `(${productId}, 0, 1, 0, '${escapeSQL(sku)}', '${escapeSQL(cleanName)}', '${escapeSQL(screenName)}', '${escapeSQL(photoPath)}', ${priceWhosale}, ${product.description ? `'${escapeSQL(product.description)}'` : 'NULL'}, ${descriptionTranslated ? `'${escapeSQL(descriptionTranslated)}'` : 'NULL'}, ${now}, ${now})`
    );
    
    // Добавляем характеристики в product_options (ключ/значение)
    const specs = product.specifications || {};
    const specKeys = ['weight', 'height', 'width', 'length', 'volume'];
    const specLabels = {
      weight: 'Weight',
      height: 'Height', 
      width: 'Width',
      length: 'Length',
      volume: 'Volume'
    };
    
    specKeys.forEach(key => {
      if (specs[key]) {
        photoValues.push(
          `(NULL, ${productId}, '${specLabels[key]}', '${escapeSQL(specs[key])}', 0, ${now})`
        );
      }
    });

    // Добавляем все фотографии в product_photos, но только валидные
    const allImages = product.images && product.images.length > 0 
      ? product.images.filter(img => img && img.trim().length > 0)
      : (product.image && product.image.trim().length > 0 ? [product.image] : []);
    
    // Фильтруем дубликаты и пустые изображения
    const uniqueImages = [];
    const seenUrls = new Set();
    
    // Если в изображениях есть placeholder - ТОЛЬКО он, больше ничего не добавляем
    const hasPlaceholder = allImages.some(img => img === 'placeholder');
    if (hasPlaceholder) {
      uniqueImages.push('placeholder');
    } else {
      // Если нет placeholder - обрабатываем реальные изображения
      allImages.forEach((imgUrl) => {
        if (!imgUrl || typeof imgUrl !== 'string') return;
        const trimmed = imgUrl.trim();
        if (trimmed.length < 10) return; // Минимальная длина для валидного URL
        if (trimmed.startsWith('data:')) return; // Пропускаем data: URI
        
        // Нормализуем URL для проверки дубликатов (убираем параметры запроса)
        const normalizedUrl = trimmed.split('?')[0].split('#')[0];
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          uniqueImages.push(trimmed);
        }
      });
    }
    
    uniqueImages.forEach((imgUrl, index) => {
      let currentPhotoPath;
      if (index === 0 && photoPath) {
        // Первое изображение используем то же, что и в поле photo
        currentPhotoPath = photoPath;
      } else {
        // Для остальных генерируем новый путь
        currentPhotoPath = generatePhotoPath(imgUrl, productId + '_' + index);
      }
      
      if (currentPhotoPath && currentPhotoPath.trim().length > 0) {
        photoValues.push(
          `(${photoId}, ${productId}, '${escapeSQL(currentPhotoPath)}')`
        );
        photoId++;
      }
    });

    productId++;
  });

  sql += productValues.join(',\n') + ';\n\n';

  // Разделяем photoValues на две категории: фотографии и опции
  const actualPhotos = [];
  const productOptions = [];
  
  photoValues.forEach(value => {
    // Если это опция (имеет 6 параметров вместо 3)
    if (value.match(/,/g).length >= 5) {
      productOptions.push(value);
    } else {
      actualPhotos.push(value);
    }
  });

  if (actualPhotos.length > 0) {
    sql += `--
-- Dumping data for table \`product_photos\`
--

INSERT INTO \`product_photos\` (\`id\`, \`product_id\`, \`url\`) VALUES
`;
    sql += actualPhotos.join(',\n') + ';\n\n';
  }
  
  if (productOptions.length > 0) {
    sql += `--
-- Dumping data for table \`product_options\`
--

INSERT INTO \`product_options\` (\`id\`, \`product_id\`, \`name\`, \`value\`, \`sort_id\`, \`created\`) VALUES
`;
    sql += productOptions.join(',\n') + ';\n\n';
  }

  sql += `COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
`;

  return sql;
}

// Конвертация категорий в SQL миграцию
function convertCategoriesToSQL(data) {
  if (!data || !data.categories || data.categories.length === 0) {
    return '-- Нет категорий для экспорта\n';
  }

  let sql = `-- phpMyAdmin SQL Dump
-- Generated by Category Parser Extension
-- Generation Time: ${new Date().toLocaleString('ru-RU')}

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Dumping data for table \`categories\`
--

INSERT INTO \`categories\` (\`category_id\`, \`parent_id\`, \`sort_id\`, \`title\`, \`description\`, \`screen_name\`, \`screen_name_full\`, \`photo\`) VALUES
`;

  const categoryValues = [];
  let categoryId = 1;
  const categoryMap = new Map(); // Для связи ID парсера с реальным category_id

  // Сначала обрабатываем корневые категории (parent_id = 0)
  data.categories.forEach((category) => {
    const screenName = transliterate(category.name || 'category-' + categoryId);
    const photoPath = category.image ? generateCategoryPhotoPath(categoryId) : '';
    
    // Сохраняем маппинг для подкатегорий
    categoryMap.set(category.id || categoryId, categoryId);
    
    categoryValues.push(
      `(${categoryId}, 0, ${categoryId}, '${escapeSQL(category.name || '')}', ${category.description ? `'${escapeSQL(category.description)}'` : 'NULL'}, '${escapeSQL(screenName)}', '${escapeSQL(screenName)}', '${escapeSQL(photoPath)}')`
    );
    
    categoryId++;
  });

  // Затем обрабатываем подкатегории
  data.categories.forEach((category) => {
    if (category.subcategories && category.subcategories.length > 0) {
      const parentCategoryId = categoryMap.get(category.id);
      const parentScreenName = transliterate(category.name || 'category-' + parentCategoryId);
      
      category.subcategories.forEach((subcat) => {
        const subScreenName = transliterate(subcat.name || 'subcategory-' + categoryId);
        const subScreenNameFull = `${parentScreenName}/${subScreenName}`;
        const photoPath = subcat.image ? generateCategoryPhotoPath(categoryId, true) : '';
        
        categoryValues.push(
          `(${categoryId}, ${parentCategoryId}, 0, '${escapeSQL(subcat.name || '')}', ${subcat.description ? `'${escapeSQL(subcat.description)}'` : 'NULL'}, '${escapeSQL(subScreenName)}', '${escapeSQL(subScreenNameFull)}', '${escapeSQL(photoPath)}')`
        );
        
        categoryId++;
      });
    }
  });

  sql += categoryValues.join(',\n') + ';\n\n';

  sql += `COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
`;

  return sql;
}

// ========== ФУНКЦИИ ПЕРЕВОДА ==========

/**
 * Перевод текста через MyMemory Translate API (бесплатный, без API ключа)
 * Лимит: 10,000 слов/день
 * @param {string} text - Текст для перевода
 * @param {string} targetLang - Целевой язык (по умолчанию 'ru')
 * @returns {Promise<string>} - Переведенный текст
 */
async function translateText(text, targetLang = 'ru') {
  if (!text || text.trim().length === 0) {
    return '';
  }

  // Проверяем, не на русском ли уже текст
  const cyrillicRatio = (text.match(/[а-яА-ЯёЁ]/g) || []).length / text.length;
  if (cyrillicRatio > 0.3) {
    console.log('✅ Текст уже на русском, пропускаем перевод');
    return text;
  }

  try {
    // Пробуем MyMemory API (основной, бесплатный)
    console.log('🌐 Перевод через MyMemory API...');
    const translatedText = await translateWithMyMemory(text, targetLang);
    
    if (translatedText && translatedText.trim().length > 0) {
      console.log('✅ Перевод выполнен через MyMemory');
      return translatedText;
    }
  } catch (error) {
    console.warn('⚠️ MyMemory API недоступен:', error.message);
  }

  try {
    // Fallback: LibreTranslate (резервный, бесплатный)
    console.log('🌐 Перевод через LibreTranslate (резерв)...');
    const translatedText = await translateWithLibreTranslate(text, targetLang);
    
    if (translatedText && translatedText.trim().length > 0) {
      console.log('✅ Перевод выполнен через LibreTranslate');
      return translatedText;
    }
  } catch (error) {
    console.warn('⚠️ LibreTranslate недоступен:', error.message);
  }

  // Если все сервисы недоступны - возвращаем оригинальный текст
  console.warn('⚠️ Все сервисы перевода недоступны, возвращаем оригинальный текст');
  return text;
}

/**
 * Перевод через MyMemory API
 */
async function translateWithMyMemory(text, targetLang = 'ru', depth = 0) {
  const maxLength = 500; // MyMemory лимит ~500 символов на запрос
  const maxDepth = 3; // Максимальная глубина рекурсии для защиты от бесконечного цикла
  
  // Защита от бесконечной рекурсии
  if (depth > maxDepth) {
    console.warn(`⚠️ Достигнута максимальная глубина рекурсии (${maxDepth}), обрезаем текст`);
    text = text.substring(0, maxLength);
  }
  
  // Если текст длинный - разбиваем на части
  if (text.length > maxLength) {
    console.log(`📏 Текст длинный (${text.length} символов), разбиваем на части...`);
    
    // Пробуем разбить по предложениям
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    const chunks = [];
    
    if (sentences && sentences.length > 1) {
      // Есть несколько предложений - группируем их
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength) {
          if (currentChunk) chunks.push(currentChunk.trim());
          // Если одно предложение само по себе больше maxLength - обрезаем его
          if (sentence.length > maxLength) {
            chunks.push(sentence.substring(0, maxLength).trim());
          } else {
            currentChunk = sentence;
          }
        } else {
          currentChunk += sentence;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
    } else {
      // Нет предложений или только одно длинное - режем по символам
      for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.substring(i, i + maxLength).trim());
      }
    }
    
    console.log(`✂️ Разбито на ${chunks.length} частей`);
    
    // Переводим по частям с задержкой
    const translations = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.length === 0) continue;
      
      console.log(`🔄 Переводим часть ${i + 1}/${chunks.length} (${chunk.length} символов)`);
      const translated = await translateWithMyMemory(chunk, targetLang, depth + 1);
      translations.push(translated);
      
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между запросами
      }
    }
    return translations.join(' ');
  }
  
  // Текст короткий - переводим напрямую
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
    return data.responseData.translatedText.trim();
  }
  
  throw new Error('MyMemory API: Invalid response format');
}

/**
 * Перевод через LibreTranslate (резервный вариант)
 */
async function translateWithLibreTranslate(text, targetLang = 'ru', depth = 0) {
  const maxLength = 1000; // LibreTranslate может обработать больше текста
  const maxDepth = 2; // Максимальная глубина рекурсии
  
  // Защита от бесконечной рекурсии
  if (depth > maxDepth) {
    console.warn(`⚠️ Достигнута максимальная глубина рекурсии для LibreTranslate (${maxDepth}), обрезаем текст`);
    text = text.substring(0, maxLength);
  }
  
  // Если текст слишком длинный - разбиваем на части
  if (text.length > maxLength) {
    console.log(`📏 Текст длинный для LibreTranslate (${text.length} символов), разбиваем...`);
    
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.substring(i, i + maxLength).trim());
    }
    
    console.log(`✂️ Разбито на ${chunks.length} частей для LibreTranslate`);
    
    const translations = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      
      console.log(`🔄 Переводим часть ${i + 1}/${chunks.length} через LibreTranslate`);
      const translated = await translateWithLibreTranslate(chunk, targetLang, depth + 1);
      translations.push(translated);
      
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return translations.join(' ');
  }
  
  // Используем публичный инстанс LibreTranslate
  const url = 'https://libretranslate.com/translate';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: targetLang,
      format: 'text'
    })
  });
  
  if (!response.ok) {
    throw new Error(`LibreTranslate API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.translatedText) {
    return data.translatedText.trim();
  }
  
  throw new Error('LibreTranslate API: Invalid response format');
}