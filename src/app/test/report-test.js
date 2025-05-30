const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

const TEST_IMAGE_DIR = path.join(__dirname, 'img');
const OUTPUT_HTML = path.join(__dirname, 'html', 'prueba.html');
const HTML_CONTENT_PATH = path.join(__dirname, 'html', 'contenido.html');

function generateReportHTML(data) {
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Reporte Test</title></head>
<body>
  <h1>Resultado del Test</h1>
  <p>Estado: ${data.status}</p>
  <p>Duración: ${data.duration}s</p>
  <ul>${data.steps.map(s => `<li>${s.name}: ${s.status}</li>`).join('')}</ul>
</body>
</html>`;
}

(async function () {
    const testData = {
        startTime: Date.now(),
        status: 'success',
        steps: [],
        duration: 0,
        error: null
    };

    const options = new chrome.Options();
    let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

    try {
        // 1. Login
        await driver.get('http://localhost:4200/login');
        await driver.wait(until.elementLocated(By.id('email')), 10000).sendKeys('angel.castilla@vallegrande.edu.pe');
        await driver.findElement(By.id('password')).sendKeys('936609401');
        await driver.findElement(By.css('form button[type="submit"]')).click();

        // 2. Esperar dashboard
        await driver.wait(until.elementLocated(By.xpath("//h1[contains(text(), 'Dashboard')]")), 10000);
        console.log('✅ Dashboard cargado correctamente');
        testData.steps.push({ name: 'Inicio de sesión', status: 'success' });

        // 3. Navegar al módulo de reportes por clic
        const reportesLink = await driver.wait(until.elementLocated(By.xpath("//a[contains(@href, 'modulo-reportes/reportes')]")), 10000);
        await driver.sleep(2000);
        await reportesLink.click();

        await driver.wait(until.elementLocated(By.xpath("//h2[contains(text(), 'Reportes')]")), 10000);
        console.log('✅ Sección de reportes cargada');
        testData.steps.push({ name: 'Navegación a reportes', status: 'success' });

        // 4. Nuevo reporte
        await driver.wait(until.elementLocated(By.xpath("//button[contains(., 'Nuevo Reporte')]")), 10000).click();
        testData.steps.push({ name: 'Abrir modal reporte', status: 'success' });

        await driver.sleep(3000); // esperar modal

        await driver.findElement(By.id('year')).sendKeys('2024');
        await driver.findElement(By.id('trimester')).sendKeys('Abril-Junio');

        const descriptionHTML = fs.readFileSync(HTML_CONTENT_PATH, 'utf-8');
        const quillEditor = await driver.wait(until.elementLocated(By.css('.ql-editor')), 10000);
        await driver.executeScript("arguments[0].innerHTML = arguments[1];", quillEditor, descriptionHTML);
        console.log('📝 Descripción HTML insertada');
        testData.steps.push({ name: 'Insertar descripción HTML', status: 'success' });

        // 5. Agregar taller
        await driver.findElement(By.xpath("//button[contains(., 'Agregar Taller')]")).click();
        await driver.sleep(2000);

        await driver.wait(until.elementLocated(By.css('[formcontrolname="workshopName"]')), 10000).sendKeys('Taller de autoestima');
        await driver.findElement(By.css('[formcontrolname="description"]')).sendKeys('Taller muy importante');
        await driver.findElement(By.css('[formcontrolname="workshopDateStart"]')).sendKeys('2025-06-01');
        await driver.findElement(By.css('[formcontrolname="workshopDateEnd"]')).sendKeys('2025-06-05');
        console.log('🧾 Taller completado');
        testData.steps.push({ name: 'Completar taller', status: 'success' });

        // 6. Subir imágenes
        const fileInput = await driver.findElement(By.css('input[type="file"]'));
        const images = ['TALLERES1.PNG', 'TALLERES2.PNG', 'TALLERES3.PNG'].map(name => path.join(TEST_IMAGE_DIR, name));
        await fileInput.sendKeys(images.join('\n'));
        await driver.sleep(3000);
        console.log('🖼️ Imágenes subidas');
        testData.steps.push({ name: 'Subir imágenes', status: 'success' });

        // 7. Guardar taller
        await driver.findElement(By.xpath("//button[contains(., 'Guardar')]")).click();
        await driver.sleep(3000);
        testData.steps.push({ name: 'Guardar taller', status: 'success' });

        // 8. Guardar reporte
        await driver.findElement(By.xpath("//button[contains(., 'Guardar Reporte')]")).click();
        await driver.sleep(3000);
        testData.steps.push({ name: 'Guardar reporte', status: 'success' });

        // Captura final
        const finalScreenshot = path.join(__dirname, 'html', 'final.png');
        await driver.takeScreenshot().then(image => {
            fs.writeFileSync(finalScreenshot, image, 'base64');
        });

        console.log('✅ Reporte guardado y captura realizada');

    } catch (err) {
        testData.status = 'error';
        testData.error = err.message;
        testData.steps.push({ name: 'Error', status: 'error', detail: err.message });
        console.error('❌ Error:', err.message);

        await driver.takeScreenshot().then(image => {
            fs.writeFileSync("login_error.png", image, 'base64');
        });
    } finally {
        testData.duration = ((Date.now() - testData.startTime) / 1000).toFixed(1);
        const html = generateReportHTML(testData);
        fs.writeFileSync(OUTPUT_HTML, html);
        console.log('📄 Reporte generado en:', OUTPUT_HTML);
        await driver.quit();
    }
})();
