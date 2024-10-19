// Import necessary DynamoDB modules
require("dotenv").config();
const { DynamoDBClient, CreateTableCommand } = require("@aws-sdk/client-dynamodb"); // Add CreateTableCommand here
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Setup AWS DynamoDB client and document client
const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

const qutUsername = "n11202351@qut.edu.au";
const tableName = "n11202351-a2-3-videoHistory";
const sortKey = "Video"

async function createTable() {
  // Create a new table command with partition and sort keys
  const command = new CreateTableCommand({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "qut-username", AttributeType: "S" },
      { AttributeName: sortKey, AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "qut-username", KeyType: "HASH" },
      { AttributeName: sortKey, KeyType: "RANGE" }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  });

  try {
    // Send the command to create the table
    const response = await client.send(command);
    console.log("Table created successfully:", response);
  } catch (err) {
    console.error("Error creating table:", err);
  }
}

// Call the function to create the table
createTable();
