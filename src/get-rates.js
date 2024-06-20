const util = require('util');
var shipstationAPI = require('node-shipstation');

exports.handler = async (event, context) => {

    console.log("Event : " + JSON.stringify(event));

    try {
        const body = event.body ? JSON.parse(event.body) : {};

        var shipstation = new shipstationAPI(
            process.env.api_key,
            process.env.secret);

        const getShippingRatesAsync = util.promisify(shipstation.getShippingRates);

        var result = (await getShippingRatesAsync(body)).toJSON();

        return {
            statusCode: result.statusCode,
            body: JSON.stringify(result.body)
        };
    }
    catch (err) {
        console.log("Error in API :" + JSON.stringify(err));
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'An unexpected error occurs. Please try again',
                code: 'ERROR_IN_GET_RATES_API'
            })
        };
    }
}

// process.env.api_key = 'd52d49015dfb4b538f203ec9494ca9ca';
// process.env.secret = 'df2fc56ed204479a89505f47d41a511e';
// var event = require('./events/get-rates.json');
// exports.handler(event).then(data => {
//     console.log("JKM");
// }).catch(error => {
//     console.log("error");
// })
