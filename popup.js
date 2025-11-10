let parsedData = null;
let parsedDataType = null;

document.addEventListener('DOMContentLoaded', function() {
  const parseBtn = document.getElementById('parseBtn');
  const deepParseBtn = document.getElementById('deepParseBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const downloadImagesBtn = document.getElementById('downloadImagesBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  const statsDiv = document.getElementById('stats');
  const progressDiv = document.getElementById('progress');
  const parseImagesCheckbox = document.getElementById('parseImagesCheckbox');
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
        function: parseCategories,
        args: [parseImages]
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
        function: parseCategories,
        args: [parseImages]
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
            function: parseCategories,
            args: [parseImages]
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

  // Быстрый парсинг товаров
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

  // Глубокий парсинг товаров
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

      // Шаг 1: парсим текущую страницу
      statusDiv.textContent = '📋 Сбор товаров с текущей страницы...';
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: parseProducts,
        args: [true] // собираем базовые изображения сразу
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
            const details = await fetchProductDetails(product.url, parseImages);
            if (details.description) {
              description = details.description;
            }
            if (details.images && details.images.length > 0) {
              const imageSet = new Set(images);
              details.images.forEach(img => imageSet.add(img));
              images = Array.from(imageSet);
            }
          } catch (error) {
            console.error(`❌ Ошибка загрузки товара ${product.url}:`, error);
          }
        }

        totalImages += images.length;

        detailedProducts.push({
          id: detailedProducts.length + 1,
          name: product.name || 'Без названия',
          url: product.url || '',
          price: product.price || '',
          description: description || '',
          image: images[0] || product.image || '',
          images: images
        });

        await new Promise(resolve => setTimeout(resolve, 150));
      }

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

      statusDiv.textContent = `📷 Найдено ${imagesToDownload.length} изображений. Создание ZIP архива...`;
      
      // Создаем ZIP архив
      const zip = new JSZip();
      let downloaded = 0;
      let failed = 0;

      for (const img of imagesToDownload) {
        try {
          // Определяем расширение файла из URL
          let extension = '.jpg';
          try {
            const urlPath = new URL(img.url).pathname;
            const ext = urlPath.split('.').pop().split('?')[0];
            if (ext && ext.length <= 4) {
              extension = '.' + ext;
            }
          } catch (e) {}
          
          // Корректируем имя файла с правильным расширением
          let filename = img.filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, extension);
          
          console.log('Скачивание:', img.url);
          
          // Скачиваем изображение как blob
          const response = await fetch(img.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const blob = await response.blob();
          
          // Добавляем в ZIP
          zip.file(filename, blob);
          downloaded++;
          
          progressDiv.innerHTML = `
            <div><strong>Прогресс:</strong> ${downloaded + failed} из ${imagesToDownload.length}</div>
            <div><strong>Текущий файл:</strong> ${filename}</div>
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
      const zipPrefix = parsedDataType === 'products' ? 'products_images_' : 'categories_images_';
      a.href = url;
      a.download = `${zipPrefix}${new Date().getTime()}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      progressDiv.innerHTML = '';
      statusDiv.textContent = `✅ ZIP архив создан! Скачано ${downloaded} изображений${failed > 0 ? ` (Ошибок: ${failed})` : ''}`;
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
    downloadImagesBtn.disabled = true;
    clearBtn.disabled = true;
  });
});

// Функция для получения подкатегорий со страницы категории
async function fetchSubcategories(url, parseImages = false) {
  try {
    console.log(`  🌐 Загрузка страницы: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    console.log(`  ✅ Страница загружена, размер: ${html.length} байт`);
    
    // Создаем временный DOM для парсинга
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Исключаем навигацию
    const excludeSelectors = ['header', 'nav', 'footer', '.header', '.nav', '.navigation', '.navbar', '.footer', '.menu', '.top-menu', '.main-menu'];
    excludeSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });
    console.log(`  🗑️ Исключено элементов навигации`);
    
    // Ищем подкатегории (ссылки в основном контенте)
    const subcategories = [];
    const links = doc.querySelectorAll('a[href]');
    const uniqueUrls = new Set();
    
    console.log(`  🔗 Всего ссылок на странице: ${links.length}`);
    
    links.forEach(link => {
      const text = link.textContent.trim();
      const href = link.getAttribute('href');
      
      if (!text || !href || href.includes('#')) return;
      if (text.length < 2 || text.length > 200) return;
      
      // Преобразуем относительные ссылки в абсолютные
      let fullUrl;
      try {
        fullUrl = new URL(href, url).href;
      } catch {
        return;
      }
      
      if (!uniqueUrls.has(fullUrl)) {
        const subcat = {
          name: text,
          url: fullUrl
        };
        
        // Ищем изображение если нужно
        if (parseImages) {
          let imgSrc = '';
          
          // СНАЧАЛА ищем внутри самой ссылки
          const imgsInLink = link.querySelectorAll('img');
          if (imgsInLink.length > 0) {
            for (const img of imgsInLink) {
              const allAttributes = Array.from(img.attributes);
              
              imgSrc = img.currentSrc || 
                       img.src || 
                       img.getAttribute('data-src') || 
                       img.getAttribute('data-lazy-src') ||
                       img.getAttribute('data-original') ||
                       img.getAttribute('srcset') ||
                       img.getAttribute('data-image') ||
                       img.getAttribute('data-url') ||
                       '';
              
              // Ищем в любых data-* атрибутах
              if (!imgSrc) {
                for (const attr of allAttributes) {
                  if ((attr.name.startsWith('data-') || attr.name.includes('src')) && 
                      attr.value && 
                      attr.value.length > 20 &&
                      (attr.value.includes('.jpg') || attr.value.includes('.png') || attr.value.includes('.webp') || attr.value.includes('/medias/'))) {
                    imgSrc = attr.value;
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
                break;
              } else {
                imgSrc = '';
              }
            }
          }
          
          // Если не нашли в ссылке, ищем в родителе и соседних элементах
          if (!imgSrc) {
            const parent = link.closest('li, div[class*="item"], div[class*="card"], div[class*="product"], div[class*="category"], div[class*="thumb"], article, section, div');
            if (parent) {
              const imgs = parent.querySelectorAll('img');
              for (const img of imgs) {
                const allAttributes = Array.from(img.attributes);
                
                imgSrc = img.currentSrc || 
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
                  break;
                } else {
                  imgSrc = '';
                }
              }
            }
          }
          
          if (imgSrc && !imgSrc.startsWith('data:')) {
            try {
              // Преобразуем относительные пути в абсолютные
              if (imgSrc.startsWith('/') && !imgSrc.startsWith('//')) {
                const urlObj = new URL(url);
                imgSrc = urlObj.origin + imgSrc;
              } else if (imgSrc.startsWith('//')) {
                const urlObj = new URL(url);
                imgSrc = urlObj.protocol + imgSrc;
              } else if (!imgSrc.startsWith('http')) {
                imgSrc = new URL(imgSrc, url).href;
              }
              subcat.image = imgSrc;
            } catch {
              subcat.image = imgSrc;
            }
          }
        }
        
        uniqueUrls.add(fullUrl);
        subcategories.push(subcat);
        
        if (parseImages && subcat.image) {
          console.log(`    📷 Изображение найдено для "${text}": ${subcat.image}`);
        }
      }
    });
    
    console.log(`  ✅ Найдено уникальных подкатегорий: ${subcategories.length}`);
    if (parseImages) {
      const withImages = subcategories.filter(s => s.image).length;
      console.log(`  📷 С изображениями: ${withImages}`);
    }
    
    return subcategories;
  } catch (error) {
    console.error('❌ Ошибка fetch подкатегорий:', error);
    return [];
  }
}

// Функция парсинга (выполняется на странице)
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

  // Легкая прокрутка для ленивой загрузки
  const scrollHeight = document.documentElement.scrollHeight;
  window.scrollTo(0, scrollHeight);
  await wait(400);
  window.scrollTo(0, 0);
  await wait(400);

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
    '[data-product]','[data-sku]','[data-testid*="product"]',
    '.product','article','[class*="grid__item"]','[class*="item-card"]'
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

  const extractText = (element, selectors) => {
    for (const selector of selectors) {
      const found = element.querySelector(selector);
      if (found && found.textContent.trim().length > 1) {
        return found.textContent.trim();
      }
    }
    return '';
  };

  const addProduct = (product) => {
    if (!product || !product.url) return;
    if (!productsMap.has(product.url)) {
      productsMap.set(product.url, product);
    }
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

      // Минимальный текстовый контент для отсечения пустых блоков-обёрток
      if (element.textContent.replace(/\s+/g, ' ').trim().length < 6) {
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
      if (!name || name.length < 2 || name.length > 200) {
        return;
      }

      const price = extractText(element, ['[class*="price"]', '.price', '[data-price]', '.product-price']);
      const description = extractText(element, ['[class*="description"]', '.product-description', '.desc', '[data-description]']) || element.getAttribute('data-description') || '';

      if (!price && !description) {
        const textContent = element.textContent.replace(/\s+/g, ' ').trim();
        if (textContent.length < 20) {
          // всё равно добавляем товар, но помечаем пустые поля
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
        if (src) {
          const resolved = resolveImageUrl(src);
          if (!primaryImage) {
            primaryImage = resolved;
          }
          if (parseImages) {
            imagesSet.add(resolved);
          }
        }
      });

      if (!parseImages && primaryImage) {
        imagesSet.add(primaryImage);
      }

      addProduct({
        name,
        url: productUrl,
        price: price.trim(),
        description: description.trim(),
        image: primaryImage,
        images: Array.from(imagesSet)
      });
    });
  });

  // Резервный парсинг: сканируем все ссылки и ищем те, что похожи на товары
  if (productsMap.size === 0) {
    console.log('⚠️ Основные селекторы не дали результата, запускаю резервный поиск по ссылкам');
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
      description = extractText(parent, ['[class*="description"]', '.product-description', '.desc', '[data-description]']);

      if (!price && !description && parent.textContent.replace(/\s+/g, ' ').trim().length < 15) {
        return;
      }

      parent.querySelectorAll('img').forEach(img => {
        let src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
        if (!src && img.getAttribute('srcset')) {
          src = img.getAttribute('srcset').split(',')[0].trim().split(' ')[0];
        }
        if (src) {
          const resolved = resolveImageUrl(src);
          if (!primaryImage) {
            primaryImage = resolved;
          }
          if (parseImages) {
            imagesSet.add(resolved);
          }
        }
      });

      if (!parseImages && primaryImage) {
        imagesSet.add(primaryImage);
      }

      addProduct({
        name: text,
        url,
        price: price.trim(),
        description: description.trim(),
        image: primaryImage,
        images: Array.from(imagesSet)
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

    let description = '';
    const descSelectors = [
      '[class*="description"]',
      '.product-description',
      '#description',
      '.tab-description',
      '.short-description'
    ];

    for (const selector of descSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim().length > 5) {
        description = element.textContent.trim();
        break;
      }
    }

    if (!description) {
      const metaDesc = doc.querySelector('meta[name="description"]') || doc.querySelector('meta[property="og:description"]');
      if (metaDesc) {
        description = metaDesc.getAttribute('content')?.trim() || '';
      }
    }

    const imagesSet = new Set();

    const addImage = (src) => {
      if (!src) return;
      try {
        if (src.startsWith('//')) {
          imagesSet.add(new URL(url).protocol + src);
        } else {
          imagesSet.add(new URL(src, url).href);
        }
      } catch (e) {
        imagesSet.add(src);
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
          if (src) {
            addImage(src);
          }
        });
      });

      doc.querySelectorAll('img').forEach(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src) {
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

    const images = Array.from(imagesSet);

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

