const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

// --- MULTER CONFIGURATION (For Resumes) ---
const storage = multer.diskStorage({
    destination: './public/uploads/', 
    filename: function(req, file, cb) {
        cb(null, 'resume-' + req.session.userId + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public')); 
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'milestone_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Global user variable for all EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session;
    next();
});

// --- MONGODB CONNECTION ---
const url = 'mongodb://127.0.0.1:27017'; 
const client = new MongoClient(url);
const dbName = 'milestonePayDB';
let db, projects, users, tickets;

async function connectDB() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB");
        db = client.db(dbName);
        projects = db.collection('projects');
        users = db.collection('users');
        tickets = db.collection('tickets');
    } catch (err) {
        console.error("❌ Connection Error:", err);
    }
}
connectDB();

// --- AUTHENTICATION ---

app.get('/', async (req, res) => {
    try {
        const topFreelancers = await users.find({ role: 'freelancer' }).sort({ _id: -1 }).limit(3).toArray();
        const topClients = await users.find({ role: 'client' }).sort({ _id: -1 }).limit(3).toArray();
        res.render('index', { 
            session: req.session, 
            topFreelancers, 
            topClients 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading home page");
    }
});

app.get('/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const searchRegex = { $regex: query, $options: 'i' };
        
        let filter = { role: 'freelancer' };
        if (query) {
            filter.$or = [
                { skills: searchRegex },
                { bio: searchRegex },
                { name: searchRegex }
            ];
        }

        const freelancers = await users.find(filter).toArray();
        res.render('search', { session: req.session, freelancers, query });
    } catch (err) {
        console.error(err);
        res.status(500).send("Search Error");
    }
});

app.get('/register', (req, res) => res.render('register'));
app.get('/login', (req, res) => res.render('login'));

app.post('/register', async (req, res) => {
    const newUser = {
        name: req.body.name, 
        email: req.body.email, 
        password: req.body.password, 
        role: req.body.role, 
        bio: req.body.bio || "", 
        skills: "", 
        resume: "", 
        wallet: 0, 
        createdAt: new Date()
    };
    await users.insertOne(newUser);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const user = await users.findOne({ email: req.body.email, password: req.body.password });
    if (user) {
        req.session.userId = user._id;
        req.session.role = user.role;
        req.session.userName = user.name;
        res.redirect('/dashboard');
    } else {
        res.send("Invalid credentials. <a href='/login'>Try again</a>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- ADMIN CONTROL CENTER ---

app.get('/admin-dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.redirect('/login');
    try {
        const profile = await users.findOne({ _id: new ObjectId(req.session.userId) });
        const stats = {
            users: await users.countDocuments(),
            projects: await projects.countDocuments(),
            disputes: await projects.countDocuments({ "milestones.status": "Disputed" }),
            tickets: await tickets.countDocuments({ status: 'Open' })
        };
        res.render('admin-dashboard', { profile, stats });
    } catch (err) { res.status(500).send("Admin Error"); }
});

app.get('/admin/users', async (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/login');
    const allUsers = await users.find().toArray();
    res.render('admin-users', { users: allUsers });
});

app.get('/admin/projects', async (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/login');
    const allProjects = await projects.find().toArray();
    res.render('admin-projects', { projects: allProjects });
});

app.post('/admin/delete-user/:id', async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Forbidden");
    await users.deleteOne({ _id: new ObjectId(req.params.id) });
    res.redirect('/admin/users');
});

app.get('/admin/disputes', async (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/login');
    const disputedProjects = await projects.find({ "milestones.status": "Disputed" }).toArray();
    res.render('admin-disputes', { projects: disputedProjects });
});

app.get('/admin/tickets', async (req, res) => {
    if (req.session.role !== 'admin') return res.redirect('/login');
    const allTickets = await tickets.find().sort({ createdAt: -1 }).toArray();
    res.render('admin-tickets', { tickets: allTickets });
});

app.post('/admin/resolve-ticket/:id', async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Forbidden");
    await tickets.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: 'Resolved' } });
    res.redirect('/admin/tickets');
});

app.post('/admin/resolve-dispute/:p_id/:m_id/:action', async (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send("Forbidden");
    const pId = new ObjectId(req.params.p_id);
    const mId = parseInt(req.params.m_id);
    const action = req.params.action;

    const project = await projects.findOne({ _id: pId });
    if (!project) return res.status(404).send("Project not found");
    const milestone = project.milestones.find(m => m.id === mId);
    
    if (action === 'release') {
        await projects.updateOne({ _id: pId, "milestones.id": mId }, { $set: { "milestones.$.status": "Completed" } });
        await users.updateOne({ _id: new ObjectId(project.freelancerId) }, { $inc: { wallet: parseInt(milestone.amount) } });
    } else if (action === 'refund') {
        await projects.updateOne({ _id: pId, "milestones.id": mId }, { $set: { "milestones.$.status": "Refunded" } });
    }

    const updatedProject = await projects.findOne({ _id: pId });
    if (updatedProject.milestones.every(m => ['Completed', 'Refunded'].includes(m.status))) {
        await projects.updateOne({ _id: pId }, { $set: { status: 'completed' } });
    }
    
    res.redirect('/admin/disputes');
});

// --- MAIN DASHBOARD (Search & Role Management) ---

app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    if (req.session.role === 'admin') return res.redirect('/admin-dashboard');

    try {
        const profile = await users.findOne({ _id: new ObjectId(req.session.userId) });
        const searchQuery = req.query.search || "";
        const searchRegex = { $regex: searchQuery, $options: 'i' };

        // 1. Filter Ongoing Projects
        let projectQuery = (req.session.role === 'client') 
            ? { clientId: req.session.userId, status: { $ne: 'completed' } } 
            : { freelancerId: req.session.userId, status: { $ne: 'completed' } };
        
        if (searchQuery) projectQuery.title = searchRegex;
        const myActiveProjects = await projects.find(projectQuery).toArray();

        // 2. Freelancer View: Available Jobs
        let openJobsFilter = { status: 'open' };
        if (searchQuery && req.session.role === 'freelancer') openJobsFilter.title = searchRegex;
        const openJobs = await projects.find(openJobsFilter).toArray();

        // 3. Client View: Talent Search
        let talentFilter = { role: 'freelancer' };
        if (searchQuery && req.session.role === 'client') {
            talentFilter.$or = [{ name: searchRegex }, { skills: searchRegex }];
        }
        const allFreelancers = await users.find(talentFilter).toArray();

        // Data enrichment for "Confirm Hire" UI
        if (req.session.role === 'client') {
            for (let project of myActiveProjects) {
                if (project.status === 'requested' && project.applicantId) {
                    const applicant = await users.findOne({ _id: new ObjectId(project.applicantId) });
                    if (applicant) project.applicantName = applicant.name;
                }
            }
        }

        res.render('dashboard', { 
            profile, myProjects: myActiveProjects, 
            openJobs, allFreelancers, searchQuery, totalEarnings: profile.wallet || 0 
        });
    } catch (err) { res.status(500).send("Dashboard Error"); }
});

// --- PROFILE & TALENT VIEWS ---

app.get('/profile/:id', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const freelancer = await users.findOne({ _id: new ObjectId(req.params.id) });
        if (!freelancer) return res.status(404).send("User not found");
        res.render('view-profile', { freelancer });
    } catch (err) { res.status(400).send("Invalid Profile ID"); }
});

app.get('/edit-profile', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const profile = await users.findOne({ _id: new ObjectId(req.session.userId) });
    res.render('edit-profile', { profile });
});

app.post('/update-profile', upload.single('resumeFile'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const updateData = { 
        name: req.body.name, 
        bio: req.body.bio, 
        skills: req.body.skills 
    };
    if (req.file) updateData.resume = '/uploads/' + req.file.filename;
    await users.updateOne({ _id: new ObjectId(req.session.userId) }, { $set: updateData });
    req.session.userName = req.body.name;
    res.redirect('/dashboard');
});

// --- ARCHIVE & WALLET ---

app.get('/completed-projects', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const completed = await projects.find({ 
        $or: [{ clientId: req.session.userId }, { freelancerId: req.session.userId }],
        status: 'completed' 
    }).toArray();
    res.render('completed-projects', { projects: completed });
});

app.get('/earnings', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
    const history = await projects.find({ freelancerId: req.session.userId, status: 'completed' }).toArray();
    res.render('earnings', { user, history });
});

// --- PROJECT WORKFLOW & MILESTONES ---

app.post('/post-job', async (req, res) => {
    if (req.session.role !== 'client') return res.status(403).send("Forbidden");
    const budget = parseInt(req.body.budget);
    const split = Math.floor(budget / 3);
    const newJob = {
        title: req.body.title, 
        clientId: req.session.userId, 
        freelancerId: null, 
        status: 'open', 
        applicantId: null,
        milestones: [
            { id: 1, title: "Initial Setup", amount: split, status: "Pending", proof: "" },
            { id: 2, title: "Development Phase", amount: split, status: "Pending", proof: "" },
            { id: 3, title: "Final Review", amount: budget - (split * 2), status: "Pending", proof: "" }
        ]
    };
    await projects.insertOne(newJob);
    res.redirect('/dashboard');
});

app.get('/request-job/:id', async (req, res) => {
    await projects.updateOne(
        { _id: new ObjectId(req.params.id) }, 
        { $set: { status: 'requested', applicantId: req.session.userId } }
    );
    res.redirect('/dashboard');
});

app.get('/hire-freelancer/:id', async (req, res) => {
    const proj = await projects.findOne({ _id: new ObjectId(req.params.id) });
    await projects.updateOne(
        { _id: new ObjectId(req.params.id) }, 
        { $set: { freelancerId: proj.applicantId, status: 'active', applicantId: null }}
    );
    res.redirect('/dashboard');
});

// Submission Route: freelancer shares work link
app.post('/submit/:p_id/:m_id', async (req, res) => {
    const pId = new ObjectId(req.params.p_id);
    const mId = parseInt(req.params.m_id);
    await projects.updateOne(
        { _id: pId, "milestones.id": mId },
        { $set: { 
            "milestones.$.status": "Under Review", 
            "milestones.$.proof": req.body.proofLink 
        }}
    );
    res.redirect('/dashboard');
});

// Approval Route: client releases payment
app.post('/approve/:p_id/:m_id', async (req, res) => {
    const pId = new ObjectId(req.params.p_id);
    const mId = parseInt(req.params.m_id);

    await projects.updateOne({ _id: pId, "milestones.id": mId }, { $set: { "milestones.$.status": "Completed" } });
    
    const project = await projects.findOne({ _id: pId });
    const milestone = project.milestones.find(m => m.id === mId);
    
    await users.updateOne({ _id: new ObjectId(project.freelancerId) }, { $inc: { wallet: parseInt(milestone.amount) } });

    if (project.milestones.every(m => m.status === 'Completed')) {
        await projects.updateOne({ _id: pId }, { $set: { status: 'completed' } });
    }
    res.redirect('/dashboard');
});

// Client Route: dispute a milestone
app.post('/dispute/:p_id/:m_id', async (req, res) => {
    if (req.session.role !== 'client') return res.status(403).send("Forbidden");
    const pId = new ObjectId(req.params.p_id);
    const mId = parseInt(req.params.m_id);
    
    await projects.updateOne(
        { _id: pId, "milestones.id": mId },
        { $set: { "milestones.$.status": "Disputed" } }
    );
    res.redirect('/dashboard');
});

// User Route: raise a general support ticket
app.post('/raise-ticket/:p_id', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const newTicket = {
        projectId: new ObjectId(req.params.p_id),
        reporterId: new ObjectId(req.session.userId),
        reporterName: req.session.userName,
        reporterRole: req.session.role,
        reason: req.body.reason,
        description: req.body.description,
        status: 'Open',
        createdAt: new Date()
    };
    await tickets.insertOne(newTicket);
    res.redirect('/dashboard');
});

app.listen(port, () => console.log(`🚀 Milestone-Pay active at http://localhost:${port}`));