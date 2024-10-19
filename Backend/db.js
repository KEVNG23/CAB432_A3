require('dotenv').config();
const mysql = require('mysql2/promise'); // Use the promise-based version of mysql2
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({ region: 'ap-southeast-2' });

// Define the name of the secret
const secretName = "n11202351-keys-db"; 
const passwordName = "rds!db-3ef24b57-0a47-4494-998f-d8704b81848b";

// Function to retrieve the database secret from AWS Secrets Manager
async function getDatabaseSecrets() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    
    // Parse the secret string into a JavaScript object
    const secret = JSON.parse(response.SecretString);
    return secret; // Return the parsed secrets
  } catch (err) {
    console.error('Error fetching secret from Secrets Manager:', err);
    throw new Error("Unable to fetch database secrets");
  }
}

async function getDatabasePassword() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: passwordName })
    );
    
    // Parse the secret string into a JavaScript object
    const secret = JSON.parse(response.SecretString);
    return secret; // Return the parsed secrets
  } catch (err) {
    console.error('Error fetching secret from Secrets Manager:', err);
    throw new Error("Unable to fetch database secrets");
  }
}

// Function to initialize the MySQL connection pool with promise-based API
async function initializeDatabase() {
  try {
    const secrets = await getDatabaseSecrets();  // Fetch the database secrets
    const dbPassword = await getDatabasePassword();

    // Create the promise-based MySQL connection pool using the secrets
    const db = mysql.createPool({
      host: secrets.DB_HOST,
      user: secrets.DB_USER,
      password: secrets.DB_PASSWORD,
      database: secrets.DB_NAME,
      port: secrets.DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,  // Customize as needed
      queueLimit: 0
    });

    console.log("Database connection initialized");
    return db; // Return the promise-based connection pool
  } catch (err) {
    console.error('Error initializing database:', err);
    throw new Error("Database initialization failed");
  }
}

// Export the promise of the initialized database connection pool
module.exports = initializeDatabase();
