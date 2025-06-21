// mapSS.js
const axios = require('axios');
const fs = require('fs');

/**
 * Generate and save a map screenshot
 * @param {string} route - Formatted route string (e.g., "&start;Colombo&Akkaraipattu&end;Matara")
 * @param {string} filePath - Path to save the screenshot (e.g., "./filename.png")
 * @param {string} [device='desktop'] - Device type: 'desktop', 'tablet', or 'phone'
 * @returns {Promise<void>} - Resolves when screenshot is saved
 */
async function captureMapScreenshot(route, filePath, device = 'desktop') {
    try {
        console.log(`Capturing map screenshot for route: ${route} on device: ${device}`);
        // Construct the full URL
        const baseUrl = 'https://map-framer-orpin.vercel.app/#';
        const fullUrl = baseUrl + route;
        
        // Capture the screenshot
        const response = await ssweb(fullUrl, device);
        
        // Save the file
        fs.writeFileSync(filePath, response.result);
        console.log(`Screenshot saved successfully to ${filePath}`);
    } catch (error) {
        console.error('Error capturing map screenshot:', error);
        throw error; // Re-throw to allow caller to handle
    }
}

/**
 * Capture a screenshot using ScreenshotMachine
 * @param {string} url - The URL to capture
 * @param {string} device - 'desktop', 'tablet', or 'phone' (default: 'desktop')
 * @returns {Promise<{status: number, result: Buffer}>} - Resolves with the screenshot image buffer
 */
function ssweb(url, device = 'desktop') {
    return new Promise((resolve, reject) => {
        const base = 'https://www.screenshotmachine.com';
        const param = {
            url: url,
            device: device,
            cacheLimit: 0
        };

        axios({
            url: base + '/capture.php',
            method: 'POST',
            data: new URLSearchParams(Object.entries(param)),
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
        }).then((response) => {
            const cookies = response.headers['set-cookie'];

            if (response.data.status === 'success') {
                axios.get(base + '/' + response.data.link, {
                    headers: {
                        'cookie': cookies.join('')
                    },
                    responseType: 'arraybuffer'
                }).then(({ data }) => {
                    resolve({
                        status: 200,
                        result: data
                    });
                });
            } else {
                reject({
                    status: 404,
                    message: 'Link Error',
                    data: response.data
                });
            }
        }).catch(reject);
    });
}

module.exports = {
    captureMapScreenshot,
    ssweb
};