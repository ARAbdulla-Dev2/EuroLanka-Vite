const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const fs = require("fs");
const path = require("path");
const ImageModule = require("docxtemplater-image-module-free");

/**
 * Generates a DOCX document from a template with images and data
 * @param {Object} options - Configuration options
 * @param {string} options.templatePath - Path to the template DOCX file
 * @param {Object} options.data - Data to inject into the template
 * @param {Object} options.images - Image configuration
 * @param {Object} options.images.paths - Mapping of image tags to file paths
 * @param {Object} options.images.sizes - Mapping of image tags to dimensions [width, height]
 * @param {string} options.outputPath - Path to save the generated document
 * @returns {Promise<string>} Path to the generated document
 */
async function generateDocument({
    templatePath,
    data,
    images,
    outputPath
}) {
    try {
        // Validate inputs
        if (!templatePath || !data || !images || !outputPath) {
            throw new Error("Missing required parameters");
        }

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template not found at ${templatePath}`);
        }

        // Read template content
        const content = fs.readFileSync(templatePath, "binary");

        // Configure image module
        const imageOpts = {
            centered: false,
            getImage: (tagValue, tagName) => {
                const imagePath = images.paths[tagValue];
                if (!imagePath) {
                    throw new Error(`No path configured for image tag: ${tagValue}`);
                }

                const fullPath = path.resolve(imagePath);
                if (!fs.existsSync(fullPath)) {
                    throw new Error(`Image not found at ${fullPath}`);
                }

                return fs.readFileSync(fullPath);
            },
            getSize: (img, tagValue, tagName) => {
                return images.sizes[tagValue] || [100, 100]; // Default size if not specified
            }
        };

        // Process the template
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            modules: [new ImageModule(imageOpts)],
            errorHandler: (error) => {
                console.error('Template error:', error);
                if (error.properties && error.properties.id === 'unclosed_loop') {
                    console.error(`Please check your template: ${error.properties.explanation}`);
                }
                throw error;
            }
        });

        // Inject data and generate document
        console.log('Starting document rendering...');
        doc.render(data);
        console.log('Document rendered successfully');

        const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
        
        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, buf);
        console.log("Document successfully generated at:", outputPath);
        return outputPath;

    } catch (error) {
        console.error("Fatal error in document generation:", error);
        throw error;
    }
}

module.exports = generateDocument;