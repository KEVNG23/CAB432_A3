const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const dbPromise = require('./db.js');
const authenticateToken = require('./authMiddleware.js');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');  
const { QueryCommand } = require("@aws-sdk/client-dynamodb");
const DynamoDB = require("@aws-sdk/client-dynamodb");
const DynamoDBLib = require("@aws-sdk/lib-dynamodb");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { timeStamp } = require('console');


const app = express();

// DynamoDB Configuration
const qutUsername = "n11202351@qut.edu.au";
const tableName = "n11202351-a2-3-videoHistory";
const sortKey = "Video";

// Initialize DynamoDB client
const dynamoDbClient = new DynamoDB.DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBLib.DynamoDBDocumentClient.from(dynamoDbClient);

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Parse urlencoded bodies for POST form parameters
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());

// AWS Secrets Manager client setup
const secretsClient = new SecretsManagerClient({ region: 'ap-southeast-2' });

// Initialize S3 client
const s3Client = new S3Client({ region: 'ap-southeast-2' });
// Initialize S3 bucket name
const bucketName = 'n11202351-assignment2'; 

// AWS SSM client setup
const ssmClient = new SSMClient({ region: 'ap-southeast-2' });

// Function to log the video upload and transcoding history
async function logHistory(loggedInUsername, videoKey, description, quality) {
  
  const timestamp = Date.now().toString(); // Convert timestamp to string

  // Use PutCommand to insert the item
  const command = new DynamoDBLib.PutCommand({
    TableName: tableName,
    Item: {
      "qut-username": qutUsername,  // Partition key to connect with DynamoDB
      "username": loggedInUsername, // Store the user's actual username (email)
      [sortKey]: "Video",       // Sort key
      "timestamp": timestamp,
      "videoKey": videoKey,
      "description": description,
      "quality": quality,
      "status": 'transcoded'
    },
  });
  console.log(command);
  try {
    const response = await docClient.send(command);
    console.log("Put command response:", response);
  } catch (error) {
    console.error("Error logging history:", error);
  }
}




// Function to retrieve Cognito credentials from Secrets Manager
async function getCognitoSecrets() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'n11202351-cognito-keys' }) // Replace with your secret name
    );
    const secrets = JSON.parse(response.SecretString);
    return secrets; // Return the parsed Cognito secrets
  } catch (err) {
    console.error('Error fetching Cognito secrets:', err);
    throw new Error("Unable to fetch Cognito secrets");
  }
}

// Retrieve Cognito credentials and initialize the Cognito client
let cognitoClient, clientId;
async function initializeCognitoClient() {
  try {
    const cognitoSecrets = await getCognitoSecrets(); // Get Cognito details from Secrets Manager
    clientId = cognitoSecrets.COGNITO_CLIENT_ID;

    // Initialize Cognito Client
    cognitoClient = new CognitoIdentityProviderClient({
      region: cognitoSecrets.COGNITO_REGION
    });
    
    console.log('Cognito client initialized');
  } catch (err) {
    console.error('Error initializing Cognito client:', err);
  }
}

// Call to initialize Cognito Client (fetch secrets and set up the client)
initializeCognitoClient();


// Backend route for signup using Cognito
app.post(
  '/signup',
  [
    body('username').isLength({ min: 3 }),
    body('password').isLength({ min: 8 }),
    body('email').isEmail() // Add email validation
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, email } = req.body;

    try {
      // Call Cognito SignUp using the client initialized with Secrets
      const command = new SignUpCommand({
        ClientId: clientId,
        Username: username,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
      });
      const response = await cognitoClient.send(command);
  
      res.json({ message: 'User registered successfully. Please check your email for verification.', response });
    } catch (err) {
      console.error('Error during Cognito signup:', err);
      res.status(500).json({ message: 'Error during signup' });
    }
  }
);

// Backend route for email confirmation
app.post('/confirm', [
  body('username').isLength({ min: 3 }),
  body('code').isLength({ min: 6 })
], async (req, res) => {
  const { username, code } = req.body;

  try {
    const command = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: username,
      ConfirmationCode: code,
    });

    const response = await cognitoClient.send(command);
    res.json({ message: 'User confirmed successfully.', response });
  } catch (err) {
    console.error('Error during confirmation:', err);
    res.status(500).json({ message: 'Error during confirmation' });
  }
});


// Backend route for login using Cognito
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
      ClientId: clientId,
    });

    const response = await cognitoClient.send(command);
    const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult;

    // Return tokens
    res.json({ AccessToken, IdToken, RefreshToken });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ message: 'Invalid credentials or error during login' });
  }
});


// Route to generate a pre-signed URL and store metadata after video upload
app.post('/upload', authenticateToken, async (req, res) => {
  const email = req.user.email; // Use email from the token
  const { filename, description } = req.body; // Video filename and description\
  const db = await dbPromise;

  if (!filename || !description) {
    return res.status(400).json({ message: 'Filename and description are required' });
  }

  const videoKey = `${Date.now()}-${filename}`; // Generate a unique key for S3 storage

  try {
    // Generate a pre-signed URL for uploading the video to S3
    const params = {
      Bucket: bucketName,
      Key: videoKey,
      ContentType: req.body.contentType, // Change this to match the actual content type of the video
    };
    const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand(params), { expiresIn: 3600 });

    // Store the video metadata in the database
    const query = `INSERT INTO videos (email, file_path, video_description) VALUES (?, ?, ?)`;
    await db.query(query, [email, videoKey, description]);
    await logHistory(email, videoKey, description, 'uploading');
    // Return the pre-signed URL to the client
    res.status(201).json({ uploadUrl, message: 'Pre-signed URL generated successfully. Metadata stored.', videoKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating pre-signed URL and storing metadata' });
  }
});


app.post('/transcode', authenticateToken, async (req, res) => {
  const { videoKey, quality } = req.body;
  const email = req.user.email;
  const db = await dbPromise;

  if (!videoKey || !quality) {
    return res.status(400).json({ message: 'Video key and quality are required.' });
  }

  const transcodedVideoKey = `${Date.now()}-transcoded-${quality}-${videoKey}`;

  try {
    // Retrieve the original video's description
    const [rows] = await db.query('SELECT video_description FROM videos WHERE file_path = ?', [videoKey]);
        
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Original video not found.' });
    }

    const originalDescription = rows[0].video_description; // Original video description
    const transcodedDescription = `${originalDescription} - Transcoded`; // Append "Transcoded" to the description
    // Retrieve the video from S3
    const command = new GetObjectCommand({ Bucket: bucketName, Key: videoKey });
    const { Body: videoStream } = await s3Client.send(command);

    // Define transcoding profiles based on the selected quality
    const transcodingProfiles = {
      low: { resolution: '640x480', bitrate: '500k' },
      medium: { resolution: '1280x720', bitrate: '1500k' },
      high: { resolution: '1920x1080', bitrate: '3000k' },
    };

    const { resolution, bitrate } = transcodingProfiles[quality];

    // Get the system's temporary directory path
    const tmpDir = os.tmpdir();
    const transcodedVideoPath = path.join(tmpDir, `${Date.now()}-transcoded.mp4`);

    // Transcoding process using ffmpeg
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(transcodedVideoPath);
      ffmpeg(videoStream)
        .inputFormat('mp4')  // Force the input format to mp4
        .output(output)
        .videoCodec('libx264')  // Set the video codec to H.264
        .audioCodec('aac')  // Set the audio codec to AAC
        .size(resolution)  // Set the video resolution dynamically (based on input)
        .videoBitrate(bitrate)  // Set the video bitrate dynamically (based on input)
        .format('mp4')  // Set the output format to MP4
        .outputOptions('-movflags', 'frag_keyframe+empty_moov')  // Enable fragmented MP4 for streaming
        .outputOptions('-pix_fmt', 'yuv420p')  // Set the pixel format explicitly for the output
        .inputOptions('-analyzeduration', '500M', '-probesize', '500M')  // Increase buffer size for stream analysis
        .on('start', (commandLine) => {
          console.log('Spawned ffmpeg with command: ' + commandLine);  // Log the ffmpeg command
        })
        .on('stderr', (stderrLine) => {
          console.log('ffmpeg stderr: ' + stderrLine);  // Log stderr from ffmpeg
        })
        .on('end', () => {
          console.log('Transcoding completed successfully.');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error('ffmpeg error:', err.message);  // Log the ffmpeg error message
          console.error('ffmpeg stderr:', stderr);  // Log the stderr from ffmpeg
          reject(err);  // Reject the promise on error
        })
        .run();  // Run ffmpeg
    });


    
    // Upload the transcoded video back to S3
    const transcodedParams = {
      Bucket: bucketName,
      Key: transcodedVideoKey,
      Body: fs.createReadStream(transcodedVideoPath),
      ContentType: 'video/mp4',
    };
    await s3Client.send(new PutObjectCommand(transcodedParams));

    // Store the transcoded video metadata in the database
    const query = `INSERT INTO videos (email, file_path, video_description, transcoded_path, quality) VALUES (?, ?, ?, ?, ?)`;
    await db.query(query, [email, videoKey, transcodedDescription, transcodedVideoKey, quality]);
    await logHistory(email, transcodedVideoKey, transcodedDescription, quality);

    // Clean up temporary files
    fs.unlinkSync(transcodedVideoPath);

    // Send success response
    return res.status(200).json({ message: 'Transcoding complete and uploaded to S3', transcodedVideoKey });
  } catch (err) {
    console.error('Error during transcoding:', err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Error during video transcoding', error: err.message });
    }
  }
});

app.get('/history', authenticateToken, async (req, res) => {
  const loggedInUsername = req.user.email;

  // Query the history with partition key "qut-username" and filter for the logged-in "username"
  const command = new DynamoDBLib.QueryCommand({
    TableName: tableName,
    KeyConditionExpression:
      "#partitionKey = :qutUsername AND begins_with(#sortKey, :nameStart)",
    FilterExpression: "#username = :username",  // Filter by actual logged-in user's email
    ExpressionAttributeNames: {  
      "#partitionKey": "qut-username",  // Partition key (system's qut-username)
      "#sortKey": sortKey,              // Sort key for video history
      "#username": "username",          // Additional field for the logged-in user's email
    },
    ExpressionAttributeValues: {
      ":qutUsername": qutUsername,      // The static/general qut-username value
      ":nameStart": "Video",            // Sort key prefix (for "Video")
      ":username": loggedInUsername,    // The logged-in user's email
    },
  });

  try {
    const response = await docClient.send(command);
    if (response.Items && response.Items.length > 0) {
      res.status(200).json(response.Items); // Send the history data as JSON
    } else {
      res.status(404).json({ message: 'No history records found' });
    }
    console.log(response.Items);
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: "Could not fetch history" });
  }
});





// this is to check if the server is running or not!
app.get('/', async (req, res) => {
  res.status(200).json({ hello: 'hi' });
});

// Get videos with transcoded URL and available quality options
app.get('/videos', authenticateToken, async (req, res) => {
  const email = req.user.email;
  const db = await dbPromise;
  try {
      // Fetch video metadata from the database
      const [rows] = await db.query('SELECT id, file_path, video_description, transcoded_path, quality FROM videos WHERE email = ?', [email]);

      if (rows.length === 0) {
          return res.status(404).json({ message: 'No videos found' });
      }

      // Create a list of video objects with S3 URLs for each quality
      const videos = rows.map(row => ({
          id: row.id,
          original_url: `https://${bucketName}.s3.amazonaws.com/${row.file_path}`,
          transcoded_url: `https://${bucketName}.s3.amazonaws.com/${row.transcoded_file_path}`,
          description: row.video_description,
          quality: row.quality
      }));

      res.status(200).json(videos);
  } catch (err) {
      console.error('Error fetching videos from database:', err);
      res.status(500).json({ error: err.message });
  }
});


// Route to stream or download video from S3 using a pre-signed URL
app.get('/videos/:id', authenticateToken, async (req, res) => {
  const videoId = req.params.id;
  const db = await dbPromise;
  
  try {
    // Fetch the video metadata from the database
    const [rows] = await db.query('SELECT file_path FROM videos WHERE id = ?', [videoId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const videoKey = rows[0].file_path;

    // Create a GetObjectCommand to retrieve the video file
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoKey,
      ResponseContentDisposition: 'attachment'
    });

    // Generate a pre-signed URL valid for 1 hour
    const presignedURL = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Return the pre-signed URL to the client
    res.status(200).json({ url: presignedURL });

  } catch (err) {
    console.error('Error generating pre-signed URL:', err);
    res.status(500).json({ message: 'Error generating pre-signed URL' });
  }
});


// Function to fetch a single parameter from AWS SSM Parameter Store
async function getParameter(paramName) {
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: paramName,        // The name of the parameter to retrieve
        WithDecryption: true    // Set to true if the parameter is a secure string
      })
    );
    return response.Parameter.Value; // Return the value of the parameter
  } catch (err) {
    console.error(`Error fetching ${paramName} from SSM:`, err);
    throw new Error("Unable to fetch parameter");
  }
}

// Function to fetch both URLs from Parameter Store
async function getApiUrls() {
  try {
    // Fetch both parameters separately
    const backendApiUrl = await getParameter('/n11202351/API_URLS');
    //const cognitoApiUrl = await getParameter('/n11202351/Cognito_URL');
    
    return { backendApiUrl, cognitoApiUrl }; // Return both URLs as an object
  } catch (err) {
    console.error('Error fetching API URLs:', err);
    throw new Error("Unable to fetch API URLs");
  }
}

// Example API route to send both URLs to the frontend
app.get("/api/get-api-urls", async (req, res) => {
  try {
    const apiUrls = await getApiUrls(); // Fetch both URLs
    res.status(200).json(apiUrls);      // Send both URLs to the frontend
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve API URLs" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
