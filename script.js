let roadmapData = []; // Will be fetched from Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyCpTprWpjNxEEwXbogmKbaux9s7TBCFK3I",
    authDomain: "counter-010.firebaseapp.com",
    projectId: "counter-010",
    storageBucket: "counter-010.firebasestorage.app",
    messagingSenderId: "395088944227",
    appId: "1:395088944227:web:5ec6066d389ec4eaa92c56",
    measurementId: "G-4MJX2M82EJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// User ID Management (to separate data for different browsers/users)
let userId = localStorage.getItem('javaRoadmapUserId');
if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('javaRoadmapUserId', userId);
}

const USER_DOC_REF = doc(db, "roadmap_users", userId);

// State
let progress = {};
let startDate = null;

// Expose functions to global scope for HTML onclick handlers
window.togglePhase = togglePhase;
window.toggleStep = toggleStep;
window.resetProgress = resetProgress;

function renderRoadmap() {
    const container = document.getElementById('roadmap-container');
    container.innerHTML = '';

    roadmapData.forEach(phase => {
        // Create Phase Container
        const phaseDiv = document.createElement('div');
        phaseDiv.className = `phase phase-${phase.id}`;

        // Create Phase Header
        const header = document.createElement('div');
        header.className = 'phase-header';
        header.onclick = () => togglePhase(header);

        // Count total steps in this phase
        const totalPhaseSteps = phase.steps.length;

        header.innerHTML = `
            <div>
                <div class="phase-title">${phase.title}</div>
            </div>
            <div class="phase-meta">
                <span class="phase-duration">${phase.duration}</span>
                <span class="phase-progress" data-phase="${phase.id}">0/${totalPhaseSteps}</span>
                <span class="toggle-icon">▼</span>
            </div>
        `;

        // Create Phase Content
        const content = document.createElement('div');
        content.className = 'phase-content';

        // Phase Goal
        if (phase.goal) {
            const goalDiv = document.createElement('div');
            goalDiv.className = 'phase-goal';
            goalDiv.innerHTML = `<strong>🎯 Goal:</strong> ${phase.goal}`;
            content.appendChild(goalDiv);
        }

        // Steps Container
        const stepsDiv = document.createElement('div');
        stepsDiv.className = 'steps';

        phase.steps.forEach(step => {
            const stepDiv = document.createElement('div');

            if (step.isProject) {
                stepDiv.className = 'project';
            } else {
                stepDiv.className = 'step';
            }

            stepDiv.dataset.stepId = step.id;

            // Step Header/Title logic
            let html = '';

            if (step.isProject) {
                // Project layout
                html += `
                    <div class="checkbox-wrapper" onclick="toggleStep(this)" style="margin-bottom: 15px;">
                        <div class="checkbox"></div>
                        <div class="project-title">${step.title}</div>
                    </div>
                    <div><strong>⏳ Duration:</strong> ${step.duration.replace('⏳ ', '')}</div>
                `;

                if (step.technology) {
                    html += `<div style="margin-top: 10px;"><strong>Technology:</strong> ${step.technology}</div>`;
                }

                if (step.features) {
                    const label = step.modulesLabel || "Features:";
                    html += `<div style="margin-top: 10px;"><strong>${label}</strong></div>`;
                    html += `<ul class="project-features">`;
                    step.features.forEach(feature => {
                        html += `<li>${feature}</li>`;
                    });
                    html += `</ul>`;
                }

            } else {
                // Regular Step layout
                html += `
                    <div class="step-header">
                        <div class="checkbox-wrapper" onclick="toggleStep(this)">
                            <div class="checkbox"></div>
                            <span class="step-title">${step.title}</span>
                        </div>
                        <span class="step-duration">${step.duration}</span>
                    </div>
                    <div class="step-topics">
                `;

                // Topics
                if (step.topics) {
                    const label = step.topicLabel || "Learn:";
                    html += `
                        <div class="topic-section">
                            <div class="topic-label">${label}</div>
                            <ul class="topics-list">
                                ${step.topics.map(t => `<li>${t}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }

                // Practice
                if (step.practice) {
                    const label = step.practiceLabel || "Practice:";
                    html += `
                        <div class="practice-section">
                            <div class="practice-label">${label}</div>
                            <ul class="topics-list">
                                ${step.practice.map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }

                html += `</div>`; // Close step-topics
            }

            stepDiv.innerHTML = html;
            stepsDiv.appendChild(stepDiv);
        });

        content.appendChild(stepsDiv);
        phaseDiv.appendChild(header);
        phaseDiv.appendChild(content);

        container.appendChild(phaseDiv);
    });

    // We do NOT call restoreProgress here, as we wait for Firestore data
}

function togglePhase(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    content.classList.toggle('active');
}

function toggleStep(wrapper) {
    const checkbox = wrapper.querySelector('.checkbox');
    const step = wrapper.closest('.step') || wrapper.closest('.project');
    const stepId = step.dataset.stepId;

    const isChecked = !checkbox.classList.contains('checked');

    // Optimistic UI update
    if (isChecked) {
        checkbox.classList.add('checked');
        step.classList.add('completed');
    } else {
        checkbox.classList.remove('checked');
        step.classList.remove('completed');
    }

    // Update local state
    progress[stepId] = isChecked;

    // Set start date if not set
    if (!startDate && isChecked) {
        startDate = new Date().toISOString();
    }

    // Save to Firestore
    saveDataToFirestore();

    updateStats();
}

async function saveDataToFirestore() {
    try {
        await setDoc(USER_DOC_REF, {
            progress: progress,
            startDate: startDate,
            lastUpdated: new Date()
        }, { merge: true });
        console.log("Progress saved to Firebase!");
    } catch (error) {
        console.error("Error saving to Firebase:", error);
    }
}

function updateStats() {
    const allSteps = document.querySelectorAll('[data-step-id]');
    const completedSteps = document.querySelectorAll('.checkbox.checked');

    const total = allSteps.length;
    const completed = completedSteps.length;
    const remaining = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('totalSteps').textContent = total;
    document.getElementById('completedSteps').textContent = completed;
    document.getElementById('remainingSteps').textContent = remaining;
    document.getElementById('progressPercent').textContent = percent + '%';

    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = percent + '%';
    progressBar.textContent = percent + '%';

    // Update phase progress
    for (let phaseId = 0; phaseId <= 6; phaseId++) {
        const phaseSteps = document.querySelectorAll(`.phase-${phaseId} [data-step-id]`);
        const phaseCompleted = document.querySelectorAll(`.phase-${phaseId} .checkbox.checked`);
        const phaseProgress = document.querySelector(`[data-phase="${phaseId}"]`);

        if (phaseProgress) {
            phaseProgress.textContent = `${phaseCompleted.length}/${phaseSteps.length}`;

            // Highlight badges if phase is complete
            const phaseContainer = document.querySelector(`.phase-${phaseId}`);
            if (phaseContainer) {
                const durationBadge = phaseContainer.querySelector('.phase-duration');

                if (phaseCompleted.length > 0 && phaseCompleted.length === phaseSteps.length) {
                    if (durationBadge) durationBadge.classList.add('complete-badge');
                    phaseProgress.classList.add('complete-badge');
                } else {
                    if (durationBadge) durationBadge.classList.remove('complete-badge');
                    phaseProgress.classList.remove('complete-badge');
                }
            }
        }
    }

    calculateProjection(total, completed);
}

function calculateProjection(totalItems, completedItems) {
    const startDateElem = document.getElementById('startDate');
    const projectedDateElem = document.getElementById('projectedDate');
    const velocityElem = document.getElementById('velocity');

    if (!startDate) {
        startDateElem.textContent = "--";
        projectedDateElem.textContent = "--";
        velocityElem.textContent = "0";
        return;
    }

    const start = new Date(startDate);
    startDateElem.textContent = start.toLocaleDateString();

    const now = new Date();
    const timeDiff = now - start;
    const daysElapsed = Math.max(timeDiff / (1000 * 3600 * 24), 0.0001);

    if (daysElapsed < 0.001 || completedItems === 0) {
        // If just started, velocity is skewed.
        startDateElem.textContent = start.toLocaleDateString();
        projectedDateElem.textContent = "Calculating...";
        velocityElem.textContent = "0";
        return;
    }

    const velocity = completedItems / daysElapsed; // items per day
    velocityElem.textContent = velocity.toFixed(2);

    const remainingItems = totalItems - completedItems;
    const daysRemaining = remainingItems / velocity;

    const projectedDate = new Date();
    projectedDate.setDate(now.getDate() + daysRemaining);

    projectedDateElem.textContent = projectedDate.toLocaleDateString();
}

function resetProgress() {
    if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
        progress = {};
        startDate = null;
        saveDataToFirestore();

        document.querySelectorAll('.checkbox.checked').forEach(cb => {
            cb.classList.remove('checked');
        });

        document.querySelectorAll('.step.completed, .project.completed').forEach(step => {
            step.classList.remove('completed');
        });

        updateStats();
    }
}

async function restoreProgress() {
    try {
        const docSnap = await getDoc(USER_DOC_REF);

        if (docSnap.exists()) {
            const data = docSnap.data();
            progress = data.progress || {};
            startDate = data.startDate || null;
            console.log("Restored progress from Firebase:", progress);
        } else {
            console.log("No existing Firebase data. Trying LocalStorage migration...");
            // Migrate from LocalStorage if expected key exists (one-time)
            const localProgress = JSON.parse(localStorage.getItem('javaRoadmapProgress'));
            if (localProgress) {
                progress = localProgress;
                startDate = localStorage.getItem('javaRoadmapStartDate');
                saveDataToFirestore(); // Push to cloud
                console.log("Migrated LocalStorage to Firebase");
            }
        }

        // Apply UI updates based on loaded data
        Object.keys(progress).forEach(stepId => {
            if (progress[stepId]) {
                const step = document.querySelector(`[data-step-id="${stepId}"]`);
                if (step) {
                    const checkbox = step.querySelector('.checkbox');
                    if (checkbox) checkbox.classList.add('checked');
                    step.classList.add('completed');
                }
            }
        });
        updateStats();

    } catch (error) {
        console.error("Error loading from Firebase:", error);
    }
}

// Initialize on load
// Initialize on load
async function init() {
    await fetchRoadmapData();
    renderRoadmap();
    restoreProgress();
}

async function fetchRoadmapData() {
    try {
        const docRef = doc(db, "roadmap_content", "main");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            roadmapData = docSnap.data().phases;
            console.log("Roadmap data fetched from Firestore!");
        } else {
            console.error("No roadmap data found in Firestore! Please run the seeding script.");
            // Fallback or empty state could go here, but for now we warn the user
        }
    } catch (error) {
        console.error("Error fetching roadmap data:", error);
    }
}

window.addEventListener('load', init);
