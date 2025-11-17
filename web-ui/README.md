# Wind Forecast Web UI

A mobile-optimized Next.js application that displays real-time wind conditions from NOAA station AGXC1 (Los Angeles area) for ocean sports enthusiasts.

## Features

- **Real-time Wind Data**: Automatically fetches latest conditions from NOAA AGXC1 station
- **Mobile-First Design**: Optimized for mobile devices with responsive layout
- **Auto-Refresh**: Updates wind data every 5 minutes
- **Visual Categories**: Color-coded wind speed categories (Light/Moderate/Fresh/Strong/Gale)
- **Complete Weather Info**: Wind speed, direction, gusts, air/water temperature, and pressure

## Technology Stack

- **Next.js 16** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Vercel** ready for deployment

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Navigate to the web-ui directory:
```bash
cd web-ui
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoint

### `GET /api/wind-data`

Fetches the latest wind data from NOAA station AGXC1.

**Response:**
```json
{
  "success": true,
  "data": {
    "datetime": "2024-01-15T10:30:00Z",
    "windDirection": 245,
    "windSpeed": 12.5,
    "gustSpeed": 16.8,
    "pressure": 1013.2,
    "airTemp": 68.4,
    "waterTemp": 61.2
  },
  "station": "AGXC1",
  "location": "Los Angeles, CA",
  "lastUpdated": "2024-01-15T10:35:00Z"
}
```

## Deployment

This app is configured for easy deployment on Vercel:

1. Push your code to a Git repository
2. Connect your repository to Vercel
3. Deploy automatically

Alternatively, use the Vercel CLI:
```bash
npx vercel
```

## Data Source

Wind data is sourced from:
- **Station**: AGXC1 (Los Angeles, CA)
- **URL**: https://www.ndbc.noaa.gov/data/latest_obs/agxc1.txt
- **Update Frequency**: Every 10 minutes (NOAA)
- **App Refresh Rate**: Every 5 minutes

## Wind Speed Categories

- **Light**: < 7 knots (Green)
- **Moderate**: 7-13 knots (Blue)
- **Fresh**: 14-20 knots (Orange)
- **Strong**: 21-27 knots (Red)
- **Gale**: 28+ knots (Purple)

## Project Structure

```
web-ui/
├── src/
│   └── app/
│       ├── api/wind-data/       # API route for fetching wind data
│       ├── globals.css          # Global styles
│       ├── layout.tsx           # Root layout with metadata
│       └── page.tsx             # Main wind display page
├── public/                      # Static assets
├── vercel.json                  # Vercel deployment configuration
└── package.json                 # Dependencies and scripts
```
