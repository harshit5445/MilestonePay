// models/User.js
const userTemplate = {
    name: "",
    email: "",
    password: "", // We will store the password here
    role: "",     // Must be either 'client' or 'freelancer'
    wallet: 0,    // Virtual balance for payments
    createdAt: new Date()
};

module.exports = userTemplate;