import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../CSS/HomePage.css';

const API_URL = 'http://localhost:5000';  // Backend API URL

function HomePage() {
  const [videos, setVideos] = useState([]);
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [quality, setQuality] = useState('medium');  // Default to medium quality
  const [uploadError, setUploadError] = useState('');
  const [history, setHistory] = useState([]);  // Initialize as an empty array

  const navigate = useNavigate();

  // Fetch videos and history when the component mounts
  useEffect(() => {
    const fetchVideos = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await axios.get(`${API_URL}/videos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setVideos(response.data);
      } catch (error) {
        console.error('Error fetching videos:', error);
      }
    };

    const fetchHistoryData = async () => {
      const token = localStorage.getItem('token');
      try {
        const historyResponse = await axios.get(`${API_URL}/history`, {
          headers: { Authorization: `Bearer ${token}` },  // Fetch history from the API
        });
        
        const historyData = historyResponse.data;  // Correctly assign the data
        
        // Ensure the response is an array before setting it to state
        if (Array.isArray(historyData)) {
          setHistory(historyData);  // Set the history data to state if it's an array
        } else {
          console.error("Expected an array for history, but received:", historyData);
          setHistory([]);  // Set to an empty array if the response is not an array
        }
      } catch (error) {
        console.error('Error fetching history:', error);
        setHistory([]);  // Set to an empty array in case of an error
      }
    };
    

    fetchVideos();
    fetchHistoryData();  // Fetch history data
  }, []);

  const handleFileUpload = async (e) => {
    e.preventDefault();

    if (!file || !description || !quality) {
      setUploadError('Please select a file, provide a description, and choose a quality.');
      return;
    }

    const token = localStorage.getItem('token');
    setUploadError('');

    try {
      // Step 1: Request a pre-signed URL from the backend
      const filename = file.name;
      const response = await axios.post(`${API_URL}/upload`, {
        filename,
        description,
        contentType: file.type
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          timeout: 60000,
        }
      });

      const uploadUrl = response.data.uploadUrl;
      const videoKey = response.data.videoKey;

      // Step 2: Upload the file to S3 using the pre-signed URL
      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type,  // Set the correct file type (e.g., 'video/mp4')
        }
      });

      alert('Video uploaded successfully');

      // Step 3: Trigger transcoding with the selected quality
      await triggerTranscoding(videoKey, quality);

      // Fetch the updated list of videos
      const videosResponse = await axios.get(`${API_URL}/videos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVideos(videosResponse.data);
    } catch (error) {
      console.error('Error uploading video:', error);
      setUploadError('Failed to upload the video. Please try again.');
    }
  };

  // Function to trigger transcoding after the video is uploaded
  const triggerTranscoding = async (videoKey, quality) => {
    const token = localStorage.getItem('token');

    try {
      const response = await axios.post(`${API_URL}/transcode`, {
        videoKey,
        quality
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      alert('Transcoding triggered successfully');
    } catch (error) {
      console.error('Error triggering transcoding:', error);
      setUploadError('Failed to trigger transcoding. Please try again.');
    }
  };

  return (
    <div>
      <h1>Welcome to the Video Transcoding App</h1>

      <form onSubmit={handleFileUpload}>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          required
        />
        <input
          type="text"
          placeholder="Enter video description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        {/* Video Quality Selection */}
        <label>Select Quality:</label>
        <select value={quality} onChange={(e) => setQuality(e.target.value)} required>
          <option value="low">Low (480p)</option>
          <option value="medium">Medium (720p)</option>
          <option value="high">High (1080p)</option>
        </select>

        <button type="submit">Upload Video</button>
      </form>

      {uploadError && <p style={{ color: 'red' }}>{uploadError}</p>}

      <h2>Your Uploaded Videos</h2>
      <ul>
        {videos.map(video => (
          <li key={video.id}>
            <a
              href={`/video/${video.id}`}
              onClick={() => navigate(`/video/${video.id}`)}
            >
              {video.description}
            </a>
            <button
              className="download-button"
              onClick={async () => {
                const token = localStorage.getItem('token');  // Retrieve the token here
                try {
                  const response = await axios.get(`${API_URL}/videos/${video.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const downloadUrl = response.data.url;

                  // Instead of opening the URL in a new tab, directly trigger the download with a programmatic link
                  const a = document.createElement('a');
                  a.href = downloadUrl;
                  a.download = video.description || 'video.mp4';  // Set the filename based on description or use a fallback
                  document.body.appendChild(a);
                  a.click();  // Trigger the download
                  document.body.removeChild(a);  // Clean up
                } catch (error) {
                  console.error('Error fetching download URL:', error);
                }
              }}
            >
              Download
            </button>
          </li>
        ))}
      </ul>

      <h2>Video Upload & Transcoding History</h2>
      <ul>
        {history.length > 0 ? (
          history.map((item, index) => (
            <li key={index}>
              <p>Event Type: {item.status}</p>  {/* Assuming the history item has a 'status' field */}
              <p>Description: {item.description}</p>
              {item.quality && <p>Quality: {item.quality}</p>}
              <p>Timestamp: {new Date(item.timestamp).toLocaleString()}</p>  {/* Assuming 'timestamp' is stored */}
            </li>
          ))
        ) : (
          <p>No history available.</p>  // Display message if no history is available
        )}
      </ul>
    </div>
  );
}

export default HomePage;
