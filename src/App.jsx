import { useState, useEffect } from 'react';
import api from './api';
import './App.css';

// --- MOCK DE FALLBACK (RoyalGames Slots Profile) ---
const DEMO_GAMES = [
  { id: 1, title: 'Royal 777 Deluxe', type: 'SLOT', color: '#FFD700' },
  { id: 2, title: 'Fortune Tiger', type: 'SLOT', color: '#F44336' },
  { id: 3, title: 'Golden Empire', type: 'SLOT', color: '#FF9800' },
  { id: 4, title: 'Dragon Treasures', type: 'SLOT', color: '#4CAF50' },
  { id: 5, title: 'Buffalo King', type: 'SLOT', color: '#795548' },
  { id: 6, title: 'Cleopatra Gold', type: 'SLOT', color: '#9C27B0' },
  { id: 7, title: 'Zeus Thunder', type: 'SLOT', color: '#2196F3' },
  { id: 8, title: 'Mega Joker', type: 'SLOT', color: '#673AB7' },
];

function App() {
  const [status, setStatus] = useState('loading'); // loading, active, blocked, error, loading_game
  const [deviceId, setDeviceId] = useState('');
  const [kioskData, setKioskData] = useState(null);
  const [credits, setCredits] = useState(0);
  const [errorMessage, setErrorMessage] = useState(''); // Para exibir o erro na tela
  
  // Novos estados para gestão de jogos
  const [games, setGames] = useState([]); 
  const [activeGame, setActiveGame] = useState(null); // Se não for null, mostra o jogo

  // 1. Inicialização: Pega ID e Autentica
  useEffect(() => {
    const initKiosk = async () => {
      try {
        const hwid = await window.kioskAPI.getDeviceId();
        setDeviceId(hwid);

        // Autentica
        const response = await api.post('/kiosk/auth', {
          device_id: hwid,
          version: '1.0.0'
        });

        const { token, kiosk } = response.data;
        localStorage.setItem('kiosk_token', token);
        
        setKioskData(kiosk);
        setCredits(parseFloat(kiosk.credits));
        setStatus('active');

        // Busca lista de jogos reais após autenticar
        try {
            const gamesRes = await api.get('/kiosk/games', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (gamesRes.data && gamesRes.data.length > 0) {
                setGames(gamesRes.data);
            } else {
                setGames(DEMO_GAMES); // Fallback se não houver jogos no banco
            }
        } catch (gameErr) {
            console.warn("Falha ao buscar jogos, usando demo", gameErr);
            setGames(DEMO_GAMES);
        }

      } catch (error) {
        if (error.response && error.response.status === 403) {
          setStatus('blocked');
        } else {
          console.error(error);
          // Captura mensagem detalhada para debug
          const msg = error.message + (error.response ? ` (Status: ${error.response.status})` : '');
          setErrorMessage(msg);
          setStatus('error');
        }
      }
    };

    initKiosk();
  }, []);

  // 2. Heartbeat: Se estiver ativo, pinga a cada 3s
  useEffect(() => {
    if (status !== 'active' && status !== 'loading_game') return;

    const token = localStorage.getItem('kiosk_token');
    
    const interval = setInterval(async () => {
      try {
        // Envia status do jogo atual para o backend saber o que está rodando
        const payload = {
            current_game_id: activeGame ? activeGame.id : null
        };

        const res = await api.post('/kiosk/heartbeat', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log("Heartbeat - Saldo Recebido:", res.data.credits);
        
        const newCredits = parseFloat(res.data.credits);
        if (!isNaN(newCredits)) {
            setCredits(newCredits);
        }
        
        if (res.data.command === 'LOCK_SCREEN') {
           setStatus('blocked');
           setActiveGame(null); // Fecha jogo se bloquear
        }

      } catch (err) {
        console.log("Erro no heartbeat", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, activeGame]);

  // Função para abrir o jogo
  const handlePlayGame = async (game) => {
    if (credits <= 0) {
        alert("Saldo insuficiente para iniciar.");
        return;
    }
    
    // Mostra loading visual antes de abrir
    setStatus('loading_game');

    try {
        const token = localStorage.getItem('kiosk_token');
        
        // Chama o backend para pegar a URL oficial
        const response = await api.post('/kiosk/start-game', {
            game_slug: game.slug || game.id
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const gameUrl = response.data.url;
        console.log("URL DO JOGO RECEBIDA:", gameUrl);

        // Configura o jogo ativo com a URL recebida
        setActiveGame({ ...game, url: gameUrl });
        setStatus('active'); // Volta status para ativo

    } catch (error) {
        console.error("Erro ao iniciar:", error);
        setStatus('active'); // Remove loading

        // --- DIAGNÓSTICO DE ERRO MELHORADO ---
        let errorMsg = "Erro desconhecido.";
        
        if (error.response) {
            // O servidor respondeu (500, 404, 402, etc)
            const data = error.response.data;
            if (data && typeof data === 'object') {
                // Tenta pegar 'error' (nosso padrão) ou 'message' (padrão Laravel)
                errorMsg = data.error || data.message || JSON.stringify(data);
            } else {
                // Resposta não é JSON (provável erro PHP/HTML ou 404)
                errorMsg = `Erro HTTP ${error.response.status}: Verifique logs do servidor.`;
            }
        } else if (error.request) {
            // Nem chegou no servidor (Backend desligado?)
            errorMsg = "Sem resposta do servidor. O Backend está rodando?";
        } else {
            errorMsg = error.message;
        }

        alert("Falha ao abrir jogo: " + errorMsg);
    }
  };

  const handleCloseGame = () => {
      // Confirmação simples
      if(window.confirm("Deseja realmente sair do jogo?")) {
        setActiveGame(null);
      }
  };

  // --- ESTILOS INLINE ---
  const styles = {
    container: {
      height: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at center, #1a1a2e 0%, #000000 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      overflow: 'hidden',
      userSelect: 'none',
    },
    header: {
      padding: '15px 40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'rgba(0,0,0,0.2)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      zIndex: 10,
      backdropFilter: 'blur(10px)'
    },
    creditsBox: {
      textAlign: 'right',
      background: 'rgba(255,255,255,0.03)',
      padding: '6px 16px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    },
    creditLabel: {
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: '0.55rem',
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      fontWeight: '600',
      marginBottom: '1px'
    },
    creditValue: {
      color: '#e0e0e0', 
      fontSize: '1.4rem',
      fontWeight: '600', 
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      lineHeight: '1.2',
      letterSpacing: '-0.5px',
    },
    currencySymbol: {
      fontSize: '0.85rem',
      color: '#4CAF50',
      fontWeight: '500',
      marginRight: '4px',
      verticalAlign: 'baseline'
    },
    main: {
      flex: 1,
      padding: '30px 40px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '25px',
      width: '100%',
      maxWidth: '1200px'
    },
    card: {
      background: 'linear-gradient(145deg, #252525, #151515)',
      border: '1px solid #2a2a2a',
      borderRadius: '12px',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      position: 'relative',
      height: '240px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    },
    cardImagePlaceholder: {
      flex: 1,
      background: 'linear-gradient(45deg, #111 25%, #1a1a1a 25%, #1a1a1a 50%, #111 50%, #111 75%, #1a1a1a 75%, #1a1a1a 100%)',
      backgroundSize: '16px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '2rem',
      color: 'rgba(255,255,255,0.05)'
    },
    cardFooter: {
      padding: '12px',
      background: 'rgba(0,0,0,0.6)',
      borderTop: '1px solid #2a2a2a',
      textAlign: 'center'
    },
    playButton: {
      background: '#333',
      border: '1px solid #444',
      width: '100%',
      padding: '8px',
      color: '#ddd',
      fontWeight: '600',
      fontSize: '0.9rem',
      borderRadius: '4px',
      textTransform: 'uppercase',
      cursor: 'pointer',
      marginTop: '8px',
      transition: 'all 0.2s'
    },
    footer: {
      background: 'rgba(0,0,0,0.3)',
      padding: '15px 40px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      justifyContent: 'space-between',
      color: 'rgba(255, 255, 255, 0.3)',
      fontSize: '0.7rem',
      letterSpacing: '0.5px'
    },
    blockedScreen: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999,
      background: '#0f0f0f',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: '#ff4444',
      overflow: 'hidden'
    },
    // --- ESTILOS DO JOGO ATIVO ---
    gameOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#000',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column'
    },
    gameToolbar: {
        height: '40px',
        background: '#111',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px'
    },
    closeButton: {
        background: '#d32f2f',
        color: 'white',
        border: 'none',
        padding: '5px 15px',
        borderRadius: '4px',
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: '0.8rem'
    }
  };

  // --- RENDERIZAÇÃO ---
  if (status === 'loading') {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <style>
          {`
            /* Remove scrollbar visual */
            body::-webkit-scrollbar,
            body::-webkit-scrollbar-button {
              display: none;
            }

            /* Firefox */
            body {
              scrollbar-width: none;
            }

            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>

        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid #333',
            borderTop: '3px solid #4CAF50',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}
        />

        <h2 style={{ marginTop: 15, fontSize: '0.9rem', letterSpacing: 2, color: '#666' }}>
          CARREGANDO...
        </h2>
      </div>
    );
  }

  // Loading específico do jogo (Spinner Azul Neon)
  if (status === 'loading_game') {
      return (
        <div style={{...styles.container, justifyContent: 'center', alignItems: 'center'}}>
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}
            </style>
            <h2 style={{ marginBottom: 20, letterSpacing: 2 }}>CONECTANDO AO JOGO...</h2>
            <div style={{ width: 50, height: 50, border: '4px solid #333', borderTop: '4px solid #00d4ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
      );
  }

  if (status === 'blocked') {
    return (
      <div style={styles.blockedScreen}>
        <div style={{ fontSize: '3rem', marginBottom: 15, opacity: 0.8 }}>🔒</div>
        <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 500 }}>TERMINAL BLOQUEADO</h1>
        <p style={{ fontSize: '0.9rem', marginTop: 8, color: '#888' }}>Contate o administrador</p>
        <div style={{ marginTop: 30, padding: '10px 20px', background: '#1a1a1a', borderRadius: 4, border: '1px solid #333' }}>
          <p style={{ fontFamily: 'monospace', margin: 0, fontSize: '0.8rem', color: '#666' }}>ID: {deviceId}</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          style={{ marginTop: 25, padding: '10px 30px', background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Reconectar
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center', background: '#111' }}>
        <h1 style={{ color: '#ff4444', fontSize: '1.2rem' }}>⚠️ FALHA NA CONEXÃO</h1>
        <p style={{ color: '#666', fontSize: '0.9rem', marginTop: 10 }}>{errorMessage || "Não foi possível comunicar com o servidor central."}</p>
        <p style={{ color: '#444', fontSize: '0.8rem', marginTop: 5 }}>Verifique se o Backend está rodando.</p>
        <button onClick={() => window.location.reload()} style={{marginTop: 20, padding: '10px 20px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer'}}>Tentar Novamente</button>
      </div>
    );
  }

  // TELA DE JOGOS (Ativo)
  return (
    <div style={styles.container}>
      
      {/* OVERLAY DE JOGO RODANDO (USANDO WEBVIEW) */}
      {activeGame && (
          <div style={styles.gameOverlay}>
              <div style={styles.gameToolbar}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: '#4CAF50', marginRight: 10, fontWeight: 'bold' }}>R$ {credits.toFixed(2)}</span>
                      <span style={{ color: '#666', fontSize: '0.8rem' }}> | {activeGame.title}</span>
                  </div>
                  <button style={styles.closeButton} onClick={handleCloseGame}>ENCERRAR SESSÃO</button>
              </div>
              
              {/* SUBSTITUIÇÃO IMPORTANTE: USANDO WEBVIEW AO INVÉS DE IFRAME */}
              {/* O webview é um componente nativo do Electron que isola o processo do jogo */}
              <webview 
                src={activeGame.url} 
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowpopups="true"
                plugins="true" 
                partition={`persist:game_${activeGame.id}`} // Mantém sessão isolada por jogo
              />
          </div>
      )}

      {/* HEADER PROFISSIONAL / COMPACTO */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '8px', height: '24px', background: '#00d4ff', marginRight: '12px', borderRadius: '2px' }}></div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', letterSpacing: '0.5px' }}>
                KIOSK<span style={{ color: '#888', fontWeight: '400' }}>PLAY</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#666', fontFamily: 'monospace', marginTop: '2px' }}>
                {deviceId.substring(0, 12)}
              </div>
            </div>
        </div>
        
        <div style={styles.creditsBox}>
            <div style={styles.creditLabel}>SALDO ATUAL</div>
            <div style={styles.creditValue}>
              <span style={styles.currencySymbol}>R$</span>
              {credits.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL */}
      <main style={styles.main}>
        <div style={{ width: '100%', maxWidth: '1200px', marginBottom: '25px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '1px', color: '#ddd' }}>
              Catálogo de Jogos
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>{games.length} Títulos disponíveis</span>
        </div>

        <div style={styles.grid}>
            {games.map((game) => (
              <div 
                key={game.id} 
                style={styles.card}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 6px 12px rgba(0,0,0,0.5)`;
                  e.currentTarget.style.borderColor = '#555';
                  // Muda a cor do botão no hover
                  const btn = e.currentTarget.querySelector('button');
                  if(btn) {
                    btn.style.background = game.color || '#ff9800';
                    btn.style.color = '#fff';
                    btn.style.border = 'none';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
                  e.currentTarget.style.borderColor = '#2a2a2a';
                   // Reseta a cor do botão
                   const btn = e.currentTarget.querySelector('button');
                   if(btn) {
                     btn.style.background = '#333';
                     btn.style.color = '#ddd';
                     btn.style.border = '1px solid #444';
                   }
                }}
              >
                  <div style={{ ...styles.cardImagePlaceholder, color: game.color || '#666' }}>
                    {/* Se tiver imagem real, exibe, senão usa placeholder */}
                    {game.image_url ? (
                        <img src={game.image_url} alt={game.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${game.color || '#666'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', opacity: 0.8 }}>
                          ▶
                        </div>
                    )}
                  </div>
                  <div style={styles.cardFooter}>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.title}</h3>
                      <div style={{ fontSize: '0.65rem', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{game.type || 'SLOT'}</div>
                      <button style={styles.playButton} onClick={() => handlePlayGame(game)}>
                          Jogar
                      </button>
                  </div>
              </div>
            ))}
        </div>
      </main>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 6, height: 6, background: '#4caf50', borderRadius: '50%', marginRight: 8 }}></div>
          CONECTADO AO SERVIDOR
        </div>
        <div>V 1.0.0</div>
      </footer>
    </div>
  );
}

export default App;