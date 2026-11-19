// Firebase web app settings for the VRC Rowing Portal.
// These values identify the project; they are not secrets. Access is controlled by
// firestore.rules and storage.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyAh9fMfmV168JSAldKN0DKG1V7x-H5Desw",
  authDomain: "vrc-rower-s-portal.firebaseapp.com",
  projectId: "vrc-rower-s-portal",
  storageBucket: "vrc-rower-s-portal.firebasestorage.app",
  messagingSenderId: "268999739662",
  appId: "1:268999739662:web:8350e49d7303d800f12f5f",
  measurementId: "G-FR87N7PZBQ"
};

export const CLUB = {
  name: 'Vancouver Rowing Club',
  short: 'VRC',
  timeZone: 'America/Vancouver',
  location: 'Vancouver Rowing Club, Stanley Park, Vancouver, BC'
};

// Concept2 Logbook API (read-only). The client ID is public; the client secret lives only in the
// server function (GitHub secret C2_CLIENT_SECRET → functions/.env at deploy time).
export const CONCEPT2 = {
  clientId: 'CyxYSBWvx6QavQRqq1WonK0BvEkWV9s2qjZ91rNN',
  authorizeUrl: 'https://log.concept2.com/oauth/authorize',
  redirectUri: 'https://vrc-rower-s-portal.web.app/c2/callback',
  scope: 'user:read,results:read'
};
