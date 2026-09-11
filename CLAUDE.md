# COF - Site MJ (Frontend)

## Project Overview

React frontend de l'outil de gestion de sessions JDR (Chroniques Oubliées Fantasy) : comptes MJ/joueurs, campagnes, fiches de personnage, et à terme le plateau de jeu live.

## Architecture

Projet split en 2 repos :
- **COF_Back** : API Express
- **COF_Front** (ce repo) : Frontend React

## Tech Stack

- **Framework** : React 19
- **Build** : Vite 6
- **Styling** : Tailwind CSS 3.4, thème Terracotta Cream (`src/index.css`), dark mode via classe
- **Routing** : React Router 7
- **Notifications** : react-hot-toast

## Structure

```
COF_Front/
├── src/
│   ├── main.jsx            # Entrée React
│   ├── App.jsx             # Routes (ProtectedRoute / GuestRoute)
│   ├── index.css           # Variables CSS thème + Tailwind
│   ├── context/
│   │   └── AuthContext.jsx # Auth JWT (login, logout, user)
│   ├── pages/
│   │   ├── Login.jsx
│   │   └── Home.jsx
│   └── utils/
│       ├── api.js          # Client API (JWT auto-attaché)
│       └── storage.js      # localStorage (token, thème)
```

## Pages (v0.1 — phase 0)

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Connexion (pas d'inscription publique) |
| `/` | Home | Placeholder post-connexion |

Les pages de gestion de campagne, création de personnage et plateau de jeu live arrivent en phases 1 et 2 (voir `COF_Back/CLAUDE.md`).

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| VITE_API_URL | URL de l'API backend (vide en prod, proxy nginx `/api`) |

## Commandes

```bash
npm install
npm run dev
npm run build
docker-compose up -d
```
