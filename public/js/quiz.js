let currentSlide = 0;
let recommendations = [];

function showQuiz() {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('quiz-section').style.display = 'block';
    window.scrollTo(0, 0);
}

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        genres: formData.getAll('genre'),
        duration: formData.get('duration'),
        audience: formData.get('audience')
    };

    try {
        // Afficher immédiatement la section et la bannière VPN
        const recommendationsSection = document.querySelector('.recommendations-section');
        recommendationsSection.style.display = 'block';
        recommendationsSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });

        // Afficher la bannière VPN immédiatement
        const carousel = document.getElementById('recommendations-carousel');
        carousel.innerHTML = '';
        const vpnBanner = document.createElement('div');
        vpnBanner.className = 'vpn-banner';
        vpnBanner.innerHTML = `
            <h3>🌍 Accédez à tous les animés</h3>
            <p>Certains animés peuvent ne pas être disponibles dans votre région. Utilisez un VPN pour débloquer l'accès à tous les titres sur vos plateformes de streaming préférées.</p>
            <a href="https://go.nordvpn.net/aff_c?offer_id=15&aff_id=39351&url_id=1172&aff_sub=dessinsanimes" class="vpn-button" target="_blank">En savoir plus sur les VPN</a>
        `;
        carousel.appendChild(vpnBanner);

        // Ajouter un message de chargement
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'loading-message';
        loadingMessage.innerHTML = '<p>Chargement de vos recommandations...</p>';
        carousel.appendChild(loadingMessage);

        const response = await fetch('https://anime.skillsative.com/recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        recommendations = await response.json();
        if (recommendations.length > 0) {
            await displayRecommendations();
        } else {
            showNoResultsMessage();
        }
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        showErrorMessage();
    }
});

async function translateText(text) {
    if (!text) return '';
    try {
        const response = await fetch('https://api-free.deepl.com/v2/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                auth_key: '5c190c10-40c2-4296-a1fc-00a8141f5959:fx',
                text: text,
                target_lang: 'FR',
                source_lang: 'EN'
            })
        });

        if (!response.ok) {
            console.warn('Translation failed, returning original text');
            return text;
        }

        const data = await response.json();
        if (!data.translations || !data.translations[0]) {
            console.warn('Invalid translation response, returning original text');
            return text;
        }
        return data.translations[0].text;
    } catch (error) {
        console.warn('Translation error, returning original text:', error.message);
        return text;
    }
}

async function translateStatus(status) {
    const statusMap = {
        'finished_airing': 'Terminé',
        'currently_airing': 'En cours',
        'not_yet_aired': 'À venir'
    };

    return statusMap[status] || status;
}

function showNoResultsMessage() {
    const carousel = document.getElementById('recommendations-carousel');
    carousel.innerHTML = `
        <div class="recommendation-card">
            <h4>Aucun résultat</h4>
            <p>Aucune recommandation trouvée. Essayez avec d'autres critères.</p>
        </div>
    `;
}

function showErrorMessage() {
    const carousel = document.getElementById('recommendations-carousel');
    carousel.innerHTML = `
        <div class="recommendation-card">
            <h4>Erreur</h4>
            <p>Une erreur est survenue lors de la recherche. Veuillez réessayer.</p>
        </div>
    `;
}

async function displayRecommendations() {
    const carousel = document.getElementById('recommendations-carousel');
    carousel.innerHTML = '';

    // Ajouter la bannière VPN
    const vpnBanner = document.createElement('div');
    vpnBanner.className = 'vpn-banner';
    vpnBanner.innerHTML = `
        <h3>🌍 Accédez à tous les animés</h3>
        <p>Certains animés peuvent ne pas être disponibles dans votre région. Utilisez un VPN pour débloquer l'accès à tous les titres sur vos plateformes de streaming préférées.</p>
        <a href="https://go.nordvpn.net/aff_c?offer_id=15&aff_id=39351&url_id=1172&aff_sub=dessinsanimes" class="vpn-button" target="_blank">En savoir plus sur les VPN</a>
    `;
    carousel.appendChild(vpnBanner);

    // Afficher les recommandations
    for (const anime of recommendations) {
        const card = document.createElement('div');
        card.className = 'recommendation-card';
        
        let synopsis = 'Pas de synopsis disponible';
        try {
            if (anime.node.synopsis) {
                const truncatedSynopsis = anime.node.synopsis.substring(0, 300) + 
                    (anime.node.synopsis.length > 300 ? '...' : '');
                synopsis = await translateText(truncatedSynopsis);
            }
        } catch (error) {
            console.warn('Failed to translate synopsis:', error);
            synopsis = anime.node.synopsis || 'Pas de synopsis disponible';
        }

        const status = await translateStatus(anime.node.status);
        
        const alternativeTitles = anime.node.alternative_titles
            ? `<div class="alternative-titles">
                 ${anime.node.alternative_titles.ja ? `<div class="japanese-title">🇯🇵 ${anime.node.alternative_titles.ja}</div>` : ''}
                 ${anime.node.alternative_titles.en ? `<div class="english-title">🇬🇧 ${anime.node.alternative_titles.en}</div>` : ''}
               </div>`
            : '';

        card.innerHTML = `
            <img src="${anime.node.main_picture?.large || anime.node.main_picture?.medium || 'https://via.placeholder.com/300x400'}" 
                 alt="${anime.node.title}" 
                 onerror="this.src='https://via.placeholder.com/300x400'">
            <h4><a href="https://go.nordvpn.net/aff_c?offer_id=15&aff_id=39351&url_id=1172&aff_sub=dessinsanimes" target="_blank">${anime.node.title}</a></h4>
            ${alternativeTitles}
            <p class="synopsis">${synopsis}</p>
            ${anime.node.mean ? `<div class="rating">★ ${anime.node.mean.toFixed(2)}/10</div>` : ''}
            ${anime.node.num_episodes ? `<div class="episodes">Épisodes: ${anime.node.num_episodes}</div>` : ''}
            ${status ? `<div class="status">Statut: ${status}</div>` : ''}
        `;
        
        carousel.appendChild(card);
    }
}