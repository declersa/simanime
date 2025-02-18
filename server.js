const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

const MAL_CLIENT_ID = '43a501464189410ad78f9ec0d3828fd9';
const MAL_API_URL = 'https://api.myanimelist.net/v2';

// Configuration des genres MAL avec leurs équivalents pour l'univers
const MAL_GENRES = {
    action: { id: 1, keywords: ['action', 'combat', 'martial'] },
    adventure: { id: 2, keywords: ['adventure', 'quest', 'journey'] },
    comedy: { id: 4, keywords: ['comedy', 'funny', 'humor'] },
    mystery: { id: 7, keywords: ['mystery', 'detective', 'suspense'] },
    drama: { id: 8, keywords: ['drama', 'emotional', 'slice of life'] },
    fantasy: { id: 10, keywords: ['fantasy', 'magic', 'supernatural'] },
    horror: { id: 14, keywords: ['horror', 'scary', 'thriller'] },
    scifi: { id: 24, keywords: ['sci-fi', 'science fiction', 'future', 'space'] },
    romance: { id: 22, keywords: ['romance', 'love', 'relationship'] }
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuration des sessions avec stockage sécurisé
app.use(session({
  secret: 'anime-KdmIpl23', // Clé secrète pour chiffrer la session
  resave: false, 
  saveUninitialized: true, 
  cookie: {
    secure: true, // Doit être en HTTPS
    httpOnly: true, // Empêche l'accès JavaScript (sécurisé contre XSS)
    sameSite: 'Lax', // Protège contre certaines attaques CSRF
    maxAge: 1000 * 60 * 30 // Session expire après 30 minutes
  }
}));

// Middleware pour attribuer une session unique par utilisateur
app.use((req, res, next) => {
    if (!req.session.userID) {
        req.session.userID = Math.random().toString(36).substr(2, 9); // Génère un ID unique
    }
    next();
});

// Middleware CORS pour autoriser une origine spécifique
const allowedOrigins = [
  'https://les-dessins-animes.fr',
  'https://anime.skillsative.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST'], // Autorise uniquement la méthode POST si nécessaire
}));

// Configure proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (path.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
        }
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('index', { sessionID: req.session.userID });
});

async function fetchWithRetry(url, options = {}, maxRetries = 5) {
    const delays = [1000, 2000, 4000, 8000, 16000];
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...options.headers,
                    'Accept': 'application/json',
                    'User-Agent': 'AnimeRecommendationApp/1.0'
                }
            });

            clearTimeout(timeout);

            if (response.ok) {
                return response;
            }

            if (response.status >= 400 && response.status < 500) {
                throw new Error(`Client error: ${response.status}`);
            }

            throw new Error(`Server error: ${response.status}`);
        } catch (error) {
            lastError = error;
            console.warn(`Tentative ${i + 1}/${maxRetries} échouée:`, error.message);

            if (i === maxRetries - 1) {
                throw new Error(`Échec après ${maxRetries} tentatives: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, delays[i] || 16000));
        }
    }

    throw lastError;
}

async function searchAnime(query, selectedGenres = [], duration = '', audience = '') {
    try {
        console.log('Searching anime with params:', { query, selectedGenres, duration, audience });
        
        let searchKeywords = [];
        
        if (selectedGenres?.length > 0) {
            selectedGenres.forEach(genre => {
                if (MAL_GENRES[genre]) {
                    searchKeywords.push(...MAL_GENRES[genre].keywords);
                }
            });
        }
        
        if (query) {
            searchKeywords.push(query);
        }
        
        const searchQuery = searchKeywords.join(' ');
        
        const fields = [
            'id',
            'title',
            'main_picture',
            'alternative_titles',
            'synopsis',
            'mean',
            'rank',
            'popularity',
            'num_episodes',
            'status',
            'genres',
            'media_type',
            'rating',
            'studios'
        ].join(',');

        let url;
        if (searchQuery) {
            url = `${MAL_API_URL}/anime?q=${encodeURIComponent(searchQuery)}&limit=100&fields=${fields}&nsfw=false`; // Augmenté de 50 à 100
        } else {
            url = `${MAL_API_URL}/anime/ranking?ranking_type=bypopularity&limit=100&fields=${fields}`; // Augmenté de 50 à 100
        }
        
        console.log('Fetching from URL:', url);
        
        const response = await fetchWithRetry(url, {
            headers: {
                'X-MAL-CLIENT-ID': MAL_CLIENT_ID
            }
        });
        
        const data = await response.json();
        let animeList = data.data || [];

        const scoredList = animeList.map(anime => {
            const score = calculateAnimeScore(anime.node, {
                selectedGenres,
                duration,
                audience,
                searchKeywords
            });
            return { ...anime, score };
        }).filter(anime => anime.score > 0);

        const sortedList = scoredList
            .sort((a, b) => b.score - a.score)
            .slice(0, 12);

        return { sortedList, sessionID: req.session.userID };
    } catch (error) {
        console.error('Error in searchAnime:', error);
        throw error;
    }
}

function calculateAnimeScore(anime, preferences) {
    let score = 0;
    const {
        selectedGenres,
        duration,
        audience,
        searchKeywords
    } = preferences;

    if (!anime || !anime.title) {
        return 0;
    }

    if (anime.mean) {
        score += anime.mean * 5;
    }

    if (selectedGenres?.length > 0) {
        const animeGenres = anime.genres?.map(g => g.id) || [];
        selectedGenres.forEach(genre => {
            if (MAL_GENRES[genre] && animeGenres.includes(MAL_GENRES[genre].id)) {
                score += 30;
            }
        });
    }

    if (duration) {
        const episodes = anime.num_episodes;
        const mediaType = anime.media_type;
        
        switch (duration) {
            case 'long':
                if (episodes >= 100 && mediaType === 'tv') score += 40;
                else if (episodes >= 50 && mediaType === 'tv') score += 20;
                break;
            case 'short':
                if (episodes > 0 && episodes <= 25 && mediaType === 'tv') score += 40;
                else if (episodes <= 50 && mediaType === 'tv') score += 20;
                break;
            case 'movie':
                if (mediaType === 'movie') score += 40;
                break;
        }
    }

    if (audience) {
        const rating = anime.rating;
        switch (audience) {
            case 'children':
                if (rating === 'g') score += 40;
                else if (rating === 'pg') score += 30;
                break;
            case 'teens':
                if (rating === 'pg_13') score += 40;
                else if (rating === 'pg') score += 20;
                break;
            case 'adults':
                if (rating === 'r' || rating === 'r+') score += 40;
                else if (rating === 'pg_13') score += 20;
                break;
        }
    }

    if (anime.popularity) {
        const popularityScore = Math.max(0, (5000 - anime.popularity) / 166.67);
        score += popularityScore;
    }

    if (searchKeywords?.length > 0) {
        const animeText = [
            anime.title?.toLowerCase(),
            anime.synopsis?.toLowerCase()
        ].filter(Boolean).join(' ');

        searchKeywords.forEach(keyword => {
            if (animeText.includes(keyword.toLowerCase())) {
                score += 20;
            }
        });
    }

    if (anime.mean >= 8) {
        score += 20;
    } else if (anime.mean >= 7) {
        score += 10;
    }

    return score;
}

app.post('/recommendations', async (req, res) => {
    try {
        const { genres = [], duration = '', audience = '' } = req.body;
        console.log('Received request:', req.body);
        
        const recommendations = await searchAnime('', genres, duration, audience);
        
        if (!recommendations || recommendations.length === 0) {
            console.log('No recommendations found');
            return res.json([]);
        }
        
        console.log(`Found ${recommendations.length} recommendations`);
        res.json(recommendations);
    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ 
            error: 'Failed to get recommendations',
            message: error.message 
        });
    }
});

// Servir le fichier robots.txt
app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'robots.txt'));
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});