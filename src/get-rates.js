//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const _ = require('lodash');

//#endregion

//#region INITIALIZATION

var shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
const getShippingRatesAsync = util.promisify(shipstation.getShippingRates);

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    try {
        console.log("Event : " + JSON.stringify(event));
        console.log("Event : " + JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : {};
        var result = (await getShippingRatesAsync(body)).toJSON();

        if (result.statusCode === 200) {
            result = _.sortBy(result.body, ['shipmentCost']);
            return prepareAPIResponse(result.statusCode, result);
        }
        else {
            return prepareAPIResponse(result.statusCode, {
                message: result?.body?.ExceptionMessage ? result?.body?.ExceptionMessage : "An unexpected error occurs. Please try again",
                code: 'ERROR_IN_GET_RATES_API'
            });
        }
    }
    catch (err) {
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_RATES_API'
        });
    }
}

//#endregion

//#region UTILS

function prepareAPIResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body)
    };
}

//#endregion
