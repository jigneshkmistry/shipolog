//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const _ = require('lodash');

//#endregion

//#region INITIALIZATION

var shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
const getShippingRatesAsync = util.promisify(shipstation.getShippingRates);
const getCarriersAsync = util.promisify(shipstation.getCarriers);

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    try {
        const promises = [];
        let carrirList = [];
        console.log("Event : " + JSON.stringify(event));
        console.log("Event : " + JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : {};

        var carrirListResponse = (await getCarriersAsync()).toJSON();
        if (carrirListResponse.statusCode === 200) {
            carrirList = _.uniqBy(carrirListResponse.body, 'code'); 
        }
        else {
            return prepareAPIResponse(result.statusCode, {
                message: result?.body?.ExceptionMessage ? result?.body?.ExceptionMessage : "An unexpected error occurs. Please try again",
                code: 'ERROR_IN_GET_RATES_API'
            });
        }

        carrirList.forEach(element => {
            const getRatesBody = { ...body };
            getRatesBody.carrierCode = element.code;
            promises.push(getShippingRatesAsync(getRatesBody))
        });

        let ratesByCarrierResponse = await Promise.all(promises);

        result = ratesByCarrierResponse.map(x => {
            const rateResponse = x.toJSON();
            const req_body = JSON.parse(x.request.body);
            const carrier = _.find(carrirList, { code: req_body.carrierCode });
            if (rateResponse.statusCode === 200) {
                carrier.services = _.sortBy(rateResponse.body, ['shipmentCost']);
                return carrier;
            }
            else {
                carrier.services = [];
                carrier.error = rateResponse?.body?.ExceptionMessage ? rateResponse?.body?.ExceptionMessage : "An unexpected error occurs";
                return carrier;
            }
        });

        return prepareAPIResponse(200, result);
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
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Origin': '*', // Required for CORS support to work
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
            'Content-Type': 'application/json',
            'Strict-Transport-Security': 'max-age=31536000',
          }
    };
}

//#endregion
