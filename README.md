# 🚀 Smart Feedback Engine – AI-Powered Learning System

## 📌 Overview
Smart Feedback Engine is an AI-driven learning platform that transforms traditional evaluation into an interactive, personalized learning experience. It enables assignment creation, multi-format submissions, intelligent feedback, and continuous improvement through re-evaluation.

---

## 🎯 Key Features

### 👨‍💼 Admin Module
- Admin login
- Create assignments with:
  - Title
  - Description
  - Input format
  - Expected output
- Publish assignments via shareable links

---

### 👩‍💻 Learner Module
- Access assignments using link
- Submit answers in multiple formats:
  - Code
  - Text
  - Multi-step solutions

---

### ⚡ Evaluation Engine
- Dynamic test case-based evaluation
- Score calculation based on passed test cases
- Instant result generation

---

### 🧠 AI Smart Feedback
- Provides:
  - Detailed feedback
  - Suggestions for improvement
  - Concept-level insights
- Helps learners understand *why* they are wrong

---

### 🎯 Socratic Mode (Innovative Feature)
- Generates intelligent questions based on user submission
- Encourages critical thinking instead of direct answers

---

### 💡 Direct Feedback Mode
- Immediate feedback with:
  - Score
  - Suggestions
  - Error identification

---

### 🔁 Re-evaluation System
- Learners can improve and resubmit
- Tracks continuous improvement

---

### 📊 Feedback History Timeline
- Shows progression across attempts
- Helps learners track improvement over time

---

### 🤖 AI Mentor Mode
- Chat-based AI tutor
- Learners can ask:
  - “Why is my code wrong?”
  - “Give me a hint”
- Provides step-by-step guidance

---

## 🧩 System Architecture

Frontend (React / UI)
↓
Backend API (Node.js / Python)
↓
Evaluation Engine
↓
AI Feedback Service
↓
Database (Store submissions & feedback)


---

## 🛠️ Tech Stack

### Frontend
- HTML, CSS, JavaScript
- React.js (if used)
- Tailwind / Custom UI

### Backend
- Node.js / Express OR Python (Flask/FastAPI)

### Database
- MongoDB / MySQL

### AI Integration
- OpenAI API (for feedback & mentor)

---

## 📂 Project Structure
sensai/
├── sensai-frontend/
├── sensai-backend/
├── README.md
├── .gitignore


---

## ⚙️ Installation & Setup

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/smart-feedback-engine.git
cd smart-feedback-enginecd sensai-backend
npm install
API_KEY=your_api_key_here
PORT=5000

npm start

cd sensai-frontend
npm install
npm start

🌐 Running the Project
Frontend → http://localhost:3000
Backend → http://localhost:5000

npm run build
