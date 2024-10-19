const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const jwt = require("aws-jwt-verify");

// AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({ region: 'ap-southeast-2' });

// Function to get Cognito credentials from Secrets Manager
async function getCognitoSecrets() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'n11202351-cognito-keys' }) // Replace with your actual secret name
    );
    const secrets = JSON.parse(response.SecretString);
    return secrets;
  } catch (err) {
    console.error('Error fetching Cognito secrets from Secrets Manager:', err);
    throw new Error("Unable to fetch Cognito secrets");
  }
}

// Middleware function to authenticate token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  console.log('Received token:', token); // Log token to debug

  try {
    // Fetch Cognito credentials from Secrets Manager
    const { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } = await getCognitoSecrets();
    // Initialize the Cognito JWT Verifier with the secrets from Secrets Manager
    const accessVerifier = jwt.CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: "access",
      clientId: COGNITO_CLIENT_ID,
    });

    const idVerifier = jwt.CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: COGNITO_CLIENT_ID,
    });

    // Attempt to verify the token first as an access token
    try {
      const decodedToken = await accessVerifier.verify(token);
      // If verified successfully, set user details from access token
      req.user = {
        id: decodedToken.sub,
        username: decodedToken.username,
        email: decodedToken.email // Extract email from the token's claims
      };

      console.log('Access token decoded:', req.user); // Log decoded token info
      next(); // Proceed to next middleware or route
    } catch (accessTokenError) {
      console.log("Access token verification failed, trying ID token:", accessTokenError);

      // If verification as access token fails, try verifying as an ID token
      const decodedIdToken = await idVerifier.verify(token);

      req.user = {
        id: decodedIdToken.sub,
        username: decodedIdToken.username,
        email: decodedIdToken.email // Extract email from the token's claims
      };

      console.log('ID token decoded:', req.user); // Log decoded token info
      next(); // Proceed to next middleware or route
    }
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(403).json({ message: 'Invalid token' });
  }
}

module.exports = authenticateToken;
