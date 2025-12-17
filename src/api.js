import axios from 'axios';

// ATENÇÃO: Se rodar no emulador/outro PC, use o IP da sua máquina (ex: 192.168.1.X) em vez de localhost
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/api', 
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

export default api;