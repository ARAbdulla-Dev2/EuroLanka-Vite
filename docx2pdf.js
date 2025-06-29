const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function convertDocxToPdf(inputFilePath, outputFilePath) {
    try {
        // Validate input file
        if (!fs.existsSync(inputFilePath)) {
            throw new Error(`Input file not found: ${inputFilePath}`);
        }

        if (!outputFilePath || !outputFilePath.endsWith('.pdf')) {
            throw new Error('Output path must be a PDF file (e.g., ./filename.pdf)');
        }

        // Upload file
        const form = new FormData();
        form.append('file', fs.createReadStream(inputFilePath), {
            filename: path.basename(inputFilePath),
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        const uploadResponse = await axios.post(
            'https://filetools27.pdf24.org/client.php?action=upload',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Origin': 'https://tools.pdf24.org',
                    'Referer': 'https://tools.pdf24.org/en/docx-to-pdf',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );
        
        if (!Array.isArray(uploadResponse.data) || uploadResponse.data.length === 0) {
            throw new Error('File upload failed');
        }
        
        const fileInfo = uploadResponse.data[0];

        // Start conversion
        const convertResponse = await axios.post(
            'https://filetools27.pdf24.org/client.php?action=convertToPdf',
            {
                files: [{
                    file: fileInfo.file,
                    host: fileInfo.host,
                    name: fileInfo.name,
                    size: fileInfo.size,
                    ctime: fileInfo.ctime
                }],
                options: {
                    "usePdfa": false
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://tools.pdf24.org',
                    'Referer': 'https://tools.pdf24.org/en/docx-to-pdf'
                }
            }
        );
        
        if (!convertResponse.data?.jobId) {
            throw new Error('Conversion failed to start');
        }
        
        const jobId = convertResponse.data.jobId;

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30; // 1 minute timeout
        
        while (attempts < maxAttempts) {
            attempts++;
            await sleep(2000);
            
            const statusResponse = await axios.get(
                `https://filetools27.pdf24.org/client.php?action=getJobStatus&jobId=${jobId}`,
                {
                    headers: {
                        'Origin': 'https://tools.pdf24.org',
                        'Referer': 'https://tools.pdf24.org/en/docx-to-pdf'
                    }
                }
            );
            
            if (statusResponse.data?.status === 'done') break;
            if (statusResponse.data?.status === 'failed') {
                throw new Error('Conversion failed on server');
            }
            if (attempts === maxAttempts) {
                throw new Error('Conversion timeout');
            }
        }

        // Download PDF
        const downloadResponse = await axios.get(
            `https://filetools27.pdf24.org/client.php?mode=download&action=downloadJobResult&jobId=${jobId}`,
            {
                responseType: 'stream',
                headers: {
                    'Origin': 'https://tools.pdf24.org',
                    'Referer': 'https://tools.pdf24.org/en/docx-to-pdf'
                }
            }
        );
        
        const writer = fs.createWriteStream(outputFilePath);
        downloadResponse.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
    } catch (error) {
        throw new Error(`DOCX to PDF conversion failed: ${error.message}`);
    }
}

module.exports = convertDocxToPdf;