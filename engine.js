const fs = require('fs');
const path = require('path');
const { captureMapScreenshot } = require('./mapSS');
const generateDocument = require('./render');
const convertDocxToPdf = require('./docx2pdf');

class ItineraryEngine {
    constructor() {
        this.itinerariesPath = path.join(__dirname, './evelodatabase/itineraries.json');
        this.usersPath = path.join(__dirname, './evelodatabase/users.json');
        this.screenshotsDir = path.join(__dirname, './db/img/itinerary');
        this.tempStoreDir = path.join(__dirname, './db/temp/tempStore');
    }

    /**
     * Main function to process an itinerary
     * @param {string} itineraryId - The ID of the itinerary to process
     * @returns {Promise<Object>} - The final processed itinerary data
     */
    async processItinerary(itineraryId) {
        try {
            // Step 1: Load itinerary data
            const itinerary = await this.getItineraryById(itineraryId);
            if (!itinerary) {
                throw new Error(`Itinerary with ID ${itineraryId} not found`);
            }

            // Extract the data object from the itinerary
            const itineraryData = itinerary.data || itinerary;

            // Validate required fields
            if (!itineraryData.route || typeof itineraryData.route !== 'string') {
                throw new Error(`Invalid or missing route in itinerary ${itineraryId}`);
            }

            if (!itineraryData.dailyPlans || !Array.isArray(itineraryData.dailyPlans)) {
                throw new Error(`Invalid or missing dailyPlans in itinerary ${itineraryId}`);
            }

            // Step 2: Get user/company info
            const userId = itinerary.userId || itineraryData.userId || Object.keys(itinerary)[0]?.split('_')[1];
            if (!userId) {
                throw new Error(`Could not determine user ID for itinerary ${itineraryId}`);
            }

            const companyInfo = await this.getCompanyInfo(userId);
            if (!companyInfo) {
                throw new Error(`Company info not found for user ${userId}`);
            }

          // Step 3: Generate map screenshot
const formattedRoute = itineraryData.route.split(' - ').map((part, index) => {
    // Only process the first part (airport name)
    if (index === 0) {
        return part.replace(/\s+/g, ''); // Remove all spaces
    }
    return part; // Keep other parts as-is
}).join(' - ');

const screenshotPath = await this.generateRouteScreenshot(formattedRoute, itineraryId);

            // Step 4: Format all data for the document
            const formattedData = this.formatItineraryData(itineraryData, companyInfo, screenshotPath);

            // Step 5: Generate the final document
            const docxOutputPath = path.join(this.tempStoreDir, `${itineraryId}.docx`);
            const pdfOutputPath = path.join(this.tempStoreDir, `${itineraryId}.pdf`);
            
            // Ensure temp directory exists
            if (!fs.existsSync(this.tempStoreDir)) {
                fs.mkdirSync(this.tempStoreDir, { recursive: true });
            }

            // Generate Word document
            await this.generateItineraryDocument(formattedData, docxOutputPath);

            // Convert to PDF
            await convertDocxToPdf(docxOutputPath, pdfOutputPath);

            // Optionally: Delete the DOCX file if you only want to keep PDF
            // fs.unlinkSync(docxOutputPath);

            return {
                success: true,
                itinerary: formattedData,
                documentPath: pdfOutputPath, // Now returning PDF path instead of DOCX
                docxPath: docxOutputPath,    // Optional: keep reference to DOCX if needed
                screenshotPath: screenshotPath
            };
        } catch (error) {
            console.error('Error processing itinerary:', error);
            throw error;
        }
    }

    /**
     * Get itinerary by ID from the database
     * @param {string} itineraryId - The ID of the itinerary to find
     * @returns {Promise<Object|null>} - The itinerary data or null if not found
     */
    async getItineraryById(itineraryId) {
        try {
            if (!fs.existsSync(this.itinerariesPath)) {
                throw new Error(`Itineraries file not found at ${this.itinerariesPath}`);
            }

            const data = JSON.parse(fs.readFileSync(this.itinerariesPath, 'utf8'));
            
            // Search through all users' itineraries
            for (const userId in data) {
                if (data[userId] && typeof data[userId] === 'object') {
                    for (const itinId in data[userId]) {
                        if (itinId === itineraryId || 
                            (data[userId][itinId] && 
                             (data[userId][itinId].id === itineraryId || 
                              (data[userId][itinId].data && data[userId][itinId].data.id === itineraryId)))) {
                            // Return the full itinerary object
                            return {
                                ...data[userId][itinId],
                                userId: userId
                            };
                        }
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Error reading itineraries:', error);
            throw error;
        }
    }

    /**
     * Get company info for a user
     * @param {string} userId - The user ID
     * @returns {Promise<Object|null>} - The company info or null if not found
     */
    async getCompanyInfo(userId) {
        try {
            if (!fs.existsSync(this.usersPath)) {
                throw new Error(`Users file not found at ${this.usersPath}`);
            }

            const users = JSON.parse(fs.readFileSync(this.usersPath, 'utf8'));
            const user = users.find(u => u.id === `user_${userId}` || u.id === userId);
            return user ? user.companyInfo : null;
        } catch (error) {
            console.error('Error reading users:', error);
            throw error;
        }
    }

    /**
     * Generate a route screenshot and save it
     * @param {string} route - The route string (e.g., "Jaffna - Galle - Matara")
     * @param {string} itineraryId - The itinerary ID for filename
     * @returns {Promise<string>} - Path to the saved screenshot
     */
    async generateRouteScreenshot(route, itineraryId) {
        try {
            if (!route || typeof route !== 'string') {
                throw new Error('Invalid route format');
            }

            // Clean the route string (remove extra spaces around hyphens)
            const cleanedRoute = route.replace(/\s*-\s*/g, '-');
            
            // Format the route for the map service
            const places = cleanedRoute.split('-').filter(Boolean);
            if (places.length < 2) {
                throw new Error('Route must contain at least two locations separated by hyphens');
            }

            const formattedRoute = `&start;${places[0]}&${places.slice(1, -1).join('&')}&end;${places[places.length - 1]}`;
            
            // Ensure screenshots directory exists
            if (!fs.existsSync(this.screenshotsDir)) {
                fs.mkdirSync(this.screenshotsDir, { recursive: true });
            }

            const screenshotPath = path.join(this.screenshotsDir, `${itineraryId}.jpg`);
            await captureMapScreenshot(formattedRoute, screenshotPath, 'phone');
            
            return screenshotPath;
        } catch (error) {
            console.error('Error generating route screenshot:', error);
            throw error;
        }
    }

    /**
     * Format all itinerary data for the document template
     * @param {Object} itinerary - The itinerary data
     * @param {Object} companyInfo - The company information
     * @param {string} screenshotPath - Path to the route screenshot
     * @returns {Object} - Formatted data for the document
     */
    formatItineraryData(itinerary, companyInfo, screenshotPath) {
        // Calculate total nights (number of days - 1)
        const totalNights = itinerary.numberOfDays - 1;
        
        // Format travel date period
        const startDate = new Date(itinerary.tourStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + itinerary.numberOfDays - 1);
        
        const formatDate = (date) => {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        };
        
        const formatDateForDisplay = (date) => {
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            return date.toLocaleDateString('en-GB', options).replace(/ /g, ' ');
        };
        
        const travelDatePeriod = `${formatDateForDisplay(startDate)} – ${formatDateForDisplay(endDate)}`;
        
        // Format travelers info
        const noOfTravellers = itinerary.numberOfTravelers > 1 
            ? `${itinerary.numberOfTravelers}` 
            : '1';

        // Prepare itinerary table
        const itbTable = itinerary.dailyPlans.map((day, index) => ({
            dayNumber: `Day ${index + 1}`,
            place: day.place,
            activity: day.activity === 'custom' || !day.activity ? day.customActivity : day.activity
        }));

        // Prepare itinerary details
        const iDetail = itinerary.dailyPlans.map((day, index) => {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + index);
            
            const formattedDate = formatDate(currentDate);
            const displayDate = formatDateForDisplay(currentDate);
            
            // Format food supply in (B/L/D) format
            const meals = day.meals || {};
            const foodSupply = `(${
                meals.breakfast ? 'B' : '-'
            }/${
                meals.lunch ? 'L' : '-'
            }/${
                meals.dinner ? 'D' : '-'
            })`;
            
            // Format overnight stay
            let overnightText = 'No overnight stay';
            if (day.overnightStay) {
                const hotelName = day.hotel === 'custom' ? day.customHotel : day.hotel;
                overnightText = hotelName ? `Overnight Stay: ${hotelName}` : 'Overnight stay';
            }
            
            return {
                iDetailTitle: `Day ${index + 1} – ${day.place} (${displayDate})`,
                iDesc: day.description || 'Activities for the day',
                isOvernightStay: overnightText,
                foodSupply: foodSupply
            };
        });

        // Prepare accommodation table (only include days with overnight stay)
        const aTable = itinerary.dailyPlans
            .filter(day => day.overnightStay && (day.hotel || day.customHotel))
            .map(day => ({
                aCity: day.place,
                accomodation: day.hotel === 'custom' ? day.customHotel : day.hotel
            }));

        // Handle cover image path
        let coverImagePath;
        if (itinerary.coverImage === 'custom' && itinerary.customImage) {
            coverImagePath = path.join(__dirname, './', itinerary.customImage);
        } else {
            coverImagePath = path.join(__dirname, './public/public/default-cover.jpg');
        }

        return {
            // Company info
            address: companyInfo.address,
            phone: companyInfo.phone,
            email: companyInfo.email,
            web: companyInfo.website,
            
            // Itinerary info
            totalDays: itinerary.numberOfDays.toString(),
            totalNights: totalNights.toString(),
            touristName: itinerary.touristName,
            noOfTravellers: noOfTravellers,
            travelDatePeriod: travelDatePeriod,
            Route: itinerary.route,
            
            // Tables
            itbTable: itbTable,
            iDetail: iDetail,
            aTable: aTable,
            
            // Dates
            departureDate: formatDateForDisplay(endDate),
            
            // Images (tags that will be replaced in the template)
            logo: "companyLogo",
            templateCoverImg: "coverImage",
            mapSS: "routeMap",
            
            // Internal use (paths to actual images)
            _images: {
                paths: {
                    companyLogo: path.join(__dirname, './', companyInfo.logo),
                    coverImage: coverImagePath,
                    routeMap: screenshotPath
                },
                sizes: {
                    companyLogo: [315, 50], // width, height in pixels
                    coverImage: [698, 334],
                    routeMap: [307, 420]
                }
            }
        };
    }

    /**
     * Generate the final itinerary document
     * @param {Object} data - Formatted data for the document
     * @param {string} outputPath - Path to save the generated document
     * @returns {Promise<string>} - Path to the generated document
     */
    async generateItineraryDocument(data, outputPath) {
        try {
            const templatePath = path.join(__dirname, './db/temp/template.docx');
            
            if (!fs.existsSync(templatePath)) {
                throw new Error(`Template file not found at ${templatePath}`);
            }

            await generateDocument({
                templatePath: templatePath,
                data: data,
                images: data._images,
                outputPath: outputPath
            });
            
            return outputPath;
        } catch (error) {
            console.error('Error generating document:', error);
            throw error;
        }
    }
}

module.exports = new ItineraryEngine();