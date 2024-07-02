//#region IMPORT

const axios = require('axios');

//#endregion

//#region INITIALIZATION

const GOOGLE_ADDRESS_VALIDATOR_API_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";

// Some referenced area types.
const ADMINISTRATIVE_AREA_LEVEL_1 = 'administrative_area_level_1';
const ADMINISTRATIVE_AREA_LEVEL_2 = 'administrative_area_level_2';
const ADMINISTRATIVE_AREA_LEVEL_3 = 'administrative_area_level_3';
const POSTAL_CODE = 'postal_code';
const POSTAL_CODE_SUFFIX = 'postal_code_suffix';
const COUNTRY = 'country';
const SUBPREMISE = 'subpremise';

const  SuggestedAction =  {
    ACCEPT : 'ACCEPT',
    CONFIRM : 'CONFIRM',
    FIX : 'FIX',
    ADD_SUBPREMISES : 'ADD_SUBPREMISES'
  }

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    try {

        const body = event.body ? JSON.parse(event.body) : {};

        const url = GOOGLE_ADDRESS_VALIDATOR_API_URL + '?key=' + process.env.google_api_key;

        const response = await axios.post(url, body, {});
        //response?.data?.result.status
        var verdictResponse = calculateAddressStatus(response?.data?.result);

        response.data.result['status'] = verdictResponse.suggestedAction;

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


function calculateAddressStatus(response){

  const result = response;

  if (isMissingNonSubpremiseComponent(result) ||
      hasValidationGranularityOther(result) || hasSuspiciousComponent(result) ||
      hasUnresolvedToken(result)) {
    return {suggestedAction: SuggestedAction.FIX};
  } else if (hasMajorInference(result) || hasReplacement(result)) {
    return {suggestedAction: SuggestedAction.CONFIRM};
  } else if (isMissingExactlyUSASubpremise(result)) {
    return {suggestedAction: SuggestedAction.ADD_SUBPREMISES};
  } else {
    return {suggestedAction: SuggestedAction.ACCEPT};
  }
}

function isMissingNonSubpremiseComponent(result) {
    const missingComponents = result.address?.missingComponentTypes || [];
    return (missingComponents.length > 1) ||
        ((missingComponents.length === 1) &&
         (missingComponents[0] !== SUBPREMISE));
  }

  function hasValidationGranularityOther(result) {
    return !result.verdict?.validationGranularity ||
        result.verdict.validationGranularity === "OTHER";
  }

  function hasSuspiciousComponent(result) {
    return result.address.addressComponents.some(
        c => c.confirmationLevel === 'UNCONFIRMED_AND_SUSPICIOUS');
  }

  function hasUnresolvedToken(result) {
    return (result.address.unresolvedTokens || []).length > 0;
  }

  function hasMajorInference(result) {
    const minorComponents = new Set([
      POSTAL_CODE, POSTAL_CODE_SUFFIX, ADMINISTRATIVE_AREA_LEVEL_1,
      ADMINISTRATIVE_AREA_LEVEL_2, ADMINISTRATIVE_AREA_LEVEL_3, COUNTRY
    ]);
    return result.address.addressComponents.some(
        c => c.isInferred && !minorComponents.has(c.componentType));
  }

  function hasReplacement(result) {
    return !!result.verdict?.hasReplacedComponents;
  }
  
  function isMissingExactlyUSASubpremise(result) {
    return isUSA(result.address) &&
        (result.address.missingComponentTypes?.length === 1) &&
        (result.address.missingComponentTypes[0] === SUBPREMISE);
  }
  
  function isUSA(address) {
    return address.postalAddress?.regionCode === 'US';
  }
  
//#endregion
