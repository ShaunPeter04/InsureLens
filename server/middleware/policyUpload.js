const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const directory = path.resolve(__dirname, "../uploads/policies");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdir(directory, { recursive: true, mode: 0o700 }, error => cb(error, directory));
    },

    filename: (req, file, cb) => {
        cb(null, crypto.randomUUID() + ".pdf");
    },
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(
            new Error("Only PDF policy documents are allowed."),
            false
        );
    }
};

const policyUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1, fields: 5, parts: 6, fieldSize: 2048,
    },
});

module.exports = policyUpload;