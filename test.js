const engine = require('./engine');

// Process an itinerary
engine.processItinerary('itin_1750491928113_kgvxbdo5p')
    .then(result => {
        console.log('Itinerary processed successfully:', result);
    })
    .catch(error => {
        console.error('Error processing itinerary:', error);
    });