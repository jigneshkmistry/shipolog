//#region IMPORT

const axios = require('axios');

//#endregion

//#region INITIALIZATION

const GOOGLE_ADDRESS_VALIDATOR_API_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    try {

        const body = event.body ? JSON.parse(event.body) : {};

        const url = GOOGLE_ADDRESS_VALIDATOR_API_URL + '?key=' + process.env.google_api_key;

        const response = await axios.post(url, body, {});

        return prepareAPIResponse(response.status,response?.data?.result);
    } 
    catch (err) {
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET-VALIDATE-GOOGLE-ADDRESS_API'
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
