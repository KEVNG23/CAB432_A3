import axios from 'axios';

let API_URL = ''; // backend API URL store in parameter store AWS
const COGNITO_API_URL = 'https://cognito-idp.ap-southeast-2.amazonaws.com/'; // This Cognito URL is stored in parameter store AWS
// need to change the localhost to n11202351_a2.cab432.com/ to be able to run in EC2

// Cognito User Pool ID and Client ID from your environment variables
const USER_POOL_ID = "ap-southeast-2_cF6el0hul";
const CLIENT_ID = "40ip1dgpidjjalo338c0ddrdvg";

// Fetch both API URLs from the backend
const fetchApiUrls = async () => {
  if (!API_URL || !COGNITO_API_URL) { // Fetch only if not already fetched
    try {
      const response = await axios.get('/api/get-api-urls'); // Fetch both URLs from the backend
      API_URL = response.data.backendApiUrl;   // Access the backend API URL from the JSON response
      //COGNITO_API_URL = response.data.cognitoApiUrl; // Access the Cognito API URL from the JSON response
      console.log('Backend API URL:', API_URL);
      console.log('Cognito API URL:', COGNITO_API_URL);
    } catch (error) {
      console.error('Error fetching API URLs:', error);
      throw error;
    }
  }
  return { API_URL };
};

// Function to handle user signup using Cognito
export const signup = async (username, password, email) => {

  try {
    const response = await axios.post(`${COGNITO_API_URL}`, {
      ClientId: CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email }
      ]
    }, {
      headers: {
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
        'Content-Type': 'application/x-amz-json-1.1'
      }
    });
    
    console.log('Signup successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Signup error:', error.response ? error.response.data : error);
    throw error;
  }
};

// Function to handle email verification via backend at /verify-email
export const verifyEmail = async (username, code) => {
  const { API_URL } = await fetchApiUrls();

  try {
    const response = await axios.post(`${API_URL}/confirm`, { // Update this to your backend API route
      username,
      code,
    });

    console.log('Email verification successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Email verification error:', error.response ? error.response.data : error);
    throw error;
  }
};

export const login = async (username, password) => {
  try {
    const response = await axios.post(`${COGNITO_API_URL}`, {
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
      ClientId: CLIENT_ID
    }, {
      headers: {
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        'Content-Type': 'application/x-amz-json-1.1'
      }
    });

    console.log('Login successful:', response.data);

    const { AccessToken, IdToken, RefreshToken } = response.data.AuthenticationResult;

    // Store the tokens in localStorage for use in authenticated requests
    localStorage.setItem('accessToken', AccessToken);    // Store AccessToken
    localStorage.setItem('idToken', IdToken);            // Store IdToken (if needed)
    localStorage.setItem('refreshToken', RefreshToken);  // Store RefreshToken (for token renewal)

    return response.data.AuthenticationResult; // Return the authentication result (optional)
  } catch (error) {
    console.error('Login error:', error.response ? error.response.data : error);
    throw error;
  }
};


// Function to get a pre-signed URL for uploading a video
export const getUploadUrl = async (filename, filetype) => {
  const { API_URL } = await fetchApiUrls();
  
  try {
    const response = await axios.get(`${API_URL}/generate-upload-url`, {
      params: { filename, filetype }
    });
    
    return response.data.url;
  } catch (error) {
    console.error('Error getting upload URL:', error.response ? error.response.data : error);
    throw error;
  }
};

// Function to upload a video to S3 using a pre-signed URL and store metadata
export const uploadVideo = async (filename, filetype, file, description) => {
  const { API_URL } = await fetchApiUrls();
  
  try {
    // First, request a pre-signed URL from the backend
    const response = await axios.post(`${API_URL}/upload`, { 
      filename, 
      description 
    });
    
    const uploadUrl = response.data.uploadUrl; // Get the pre-signed URL from the response
    const videoKey = response.data.videoKey;

    // Upload the video directly to S3 using the pre-signed URL
    await axios.put(uploadUrl, file, {
      headers: {
        'Content-Type': filetype
      }
    });

    console.log('Upload successful');
    return uploadUrl.split('?')[0]; // Return the URL to the uploaded video (excluding query params)
  } catch (error) {
    console.error('Upload error:', error.response ? error.response.data : error.message);
    throw error;
  }
};

// Function to fetch the list of videos (token for authorization)
export const fetchVideos = async (token) => {
  const { API_URL } = await fetchApiUrls();
  
  try {
    const response = await axios.get(`${API_URL}/videos`, {
      headers: {
        Authorization: `Bearer ${token}` // Send token in header
      }
    });

    return response.data;
  } catch (error) {
    console.error('Fetch videos error:', error.response ? error.response.data : error.message);
    throw error;
  }
};

// Function to trigger transcoding for a video
export const triggerTranscoding = async (videoKey, quality) => {
  const token = localStorage.getItem('token');
  
  try {
    const response = await axios.post(`${API_URL}/transcode`, { 
      videoKey, 
      quality 
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json' // Ensure JSON is being sent
      }
    });

    console.log(response);
    alert('Transcoding triggered successfully');
  } catch (error) {
    console.error('Error triggering transcoding:', error);
    throw error;
  }
};

export const fetchHistory = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/history`, {
      headers: {
        Authorization: `Bearer ${token}`, // Use the token for authorization
      },
    });

    if (response.status === 200) {
      return response.data; // Return history data if the response is successful
    } else {
      throw new Error('Failed to fetch history');
    }
  } catch (error) {
    console.error('Error fetching history:', error);
    throw error; // Ensure that errors are propagated
  }
};


