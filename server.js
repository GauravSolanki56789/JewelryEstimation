const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (just the HTML, CSS, JS)
app.use(express.static('.'));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📂 Open your browser and go to: http://localhost:${PORT}`);
  console.log(`💾 All data is stored in browser localStorage (no database needed)`);
});