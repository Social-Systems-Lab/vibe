import { ipcMain } from "electron";
import { app } from "electron";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Realm = require("realm");
const sharp = require("sharp");

const ACCOUNTS_DIR = path.join(__dirname, "Accounts");
const SALT_FILENAME = "salt.dat";
const IV_FILENAME = "iv.dat";
const PUBLIC_KEY_FILENAME = "public-key.pem";
const PRIVATE_KEY_FILENAME = "private-key.pem";
const REALM_DATABASE_FILENAME = "database.realm";
const ENCRYPTION = "aes-256-cbc";
const PICTURE_FILENAME = "picture.png";
let _accounts = [];
let _accountsInitialized = false;
let _realm = null;
let _accountsDirectoryWatcher;

// gets list of accounts on the device
const getAccounts = () => {
    console.log("getAccounts called");
    if (_accountsInitialized) {
        return _accounts;
    }

    _accountsInitialized = true;
    if (!fs.existsSync(ACCOUNTS_DIR)) {
        _accounts = [];
        return _accounts;
    }
    const accountDirs = fs.readdirSync(ACCOUNTS_DIR);
    _accounts = accountDirs
        .map((dir) => {
            const accountPath = path.join(ACCOUNTS_DIR, dir);
            if (fs.statSync(accountPath).isDirectory()) {
                const account = { name: dir }; // assuming the directory name is the display name
                const picturePath = path.join(accountPath, PICTURE_FILENAME);
                if (fs.existsSync(picturePath)) {
                    account.picture = picturePath;
                }
                return account;
            }
            return null;
        })
        .filter(Boolean); // filter out any null values (non-directory files)
    return _accounts;
};

// creates a new account
const createAccount = async (name, password, picture) => {
    if (!_accountsInitialized) {
        getAccounts();
    }

    console.log("createAccount called");
    if (!fs.existsSync(ACCOUNTS_DIR)) {
        fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); // create Accounts directory if it doesn't exist
    }

    const accountPath = path.join(ACCOUNTS_DIR, name);
    if (fs.existsSync(accountPath)) {
        throw new Error("Account already exists");
    }

    fs.mkdirSync(accountPath, { recursive: true });

    // create random salt for the account
    const salt = crypto.randomBytes(16);

    // encryption key is derived from salt + password
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512");

    // create a keypair for the account
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

    // define file paths
    const saltPath = path.join(accountPath, SALT_FILENAME);
    const publicKeyPath = path.join(accountPath, PUBLIC_KEY_FILENAME);
    const privateKeyPath = path.join(accountPath, PRIVATE_KEY_FILENAME);

    // save salt to file
    fs.writeFileSync(saltPath, salt);

    // save public key to file
    fs.writeFileSync(publicKeyPath, publicKey.export({ type: "pkcs1", format: "pem" }));

    // encrypt private key using the derived encryption key and save to file
    // generate a random IV
    const iv = crypto.randomBytes(16);
    const ivPath = path.join(accountPath, IV_FILENAME);
    fs.writeFileSync(ivPath, iv);

    // create a cipher using the encryption key (32-byte version), and the IV
    const encryptionKey32 = encryptionKey.slice(0, 32);
    const cipher = crypto.createCipheriv(ENCRYPTION, encryptionKey32, iv);
    let encryptedPrivateKey = cipher.update(privateKey.export({ type: "pkcs1", format: "pem" }), "utf8", "hex");
    encryptedPrivateKey += cipher.final("hex");
    fs.writeFileSync(privateKeyPath + ".enc", encryptedPrivateKey);

    // save profile picture
    const picturePath = path.join(accountPath, PICTURE_FILENAME);
    if (picture) {
        try {
            await sharp(picture).png().toFile(picturePath);
            console.log("Image converted to PNG and saved successfully");
        } catch (error) {
            console.error("Error converting image to PNG:", error);
        }
    } else {
        console.log("Picture is undefined");
    }

    // add account to list of accounts
    _accounts.push({ name, picture: picturePath });
};

// logs into an account
const login = async (name, password) => {
    console.log("login called");
    const accountPath = path.join(ACCOUNTS_DIR, name);
    if (!fs.existsSync(accountPath)) {
        throw new Error("Account does not exist");
    }

    // read the salt and encrypted private key from files
    const saltPath = path.join(accountPath, SALT_FILENAME);
    const privateKeyPath = path.join(accountPath, PRIVATE_KEY_FILENAME + ".enc");
    const salt = fs.readFileSync(saltPath);
    const encryptedPrivateKey = fs.readFileSync(privateKeyPath, "utf8");

    // derive the encryption key from the password and salt
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512");

    // attempt to decrypt the private key
    // read the IV from a file
    const ivPath = path.join(accountPath, IV_FILENAME);
    const iv = fs.readFileSync(ivPath);

    const encryptionKey32 = encryptionKey.slice(0, 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey32, iv);
    let decryptedPrivateKey;
    try {
        decryptedPrivateKey = decipher.update(encryptedPrivateKey, "hex", "utf8");
        decryptedPrivateKey += decipher.final("utf8");
    } catch (error) {
        throw new Error("Incorrect password");
    }

    // check if the decrypted private key is valid
    if (!decryptedPrivateKey.startsWith("-----BEGIN RSA PRIVATE KEY-----")) {
        throw new Error("Incorrect password");
    }

    //console.log("decryptedPrivateKey", decryptedPrivateKey);

    // open realm database using the encryption key
    const databasePath = path.join(accountPath, REALM_DATABASE_FILENAME);

    try {
        _realm = await Realm.open({
            path: databasePath,
            encryptionKey: new Uint8Array(encryptionKey),
            schema: [],
        });
    } catch (error) {
        throw new Error("Unable to open realm database." + error.message);
    }

    // return account
    if (!_accountsInitialized) {
        getAccounts();
    }
    const account = _accounts.find((account) => account.name === name);

    console.log("returning account: ", JSON.stringify(account, null, 2));

    return account;
};

// logs out from an account
const logout = (name) => {
    console.log("logout called");
    // if (realm) {
    //     realm.close();
    //     realm = null;
    // }
};

const getIconForPath = async (filePath) => {
    try {
        const icon = await app.getFileIcon(filePath, { size: "normal" });
        return icon.toDataURL();
    } catch (error) {
        console.error("Error fetching icon:", error);
        return null; // or a default icon path
    }
};

const readDirectory = async (dir, parentPath = "") => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    let directoryTree = [];
    for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const id = path.join(parentPath, dirent.name);
        const icon = await getIconForPath(fullPath); // Fetch icon for the path

        directoryTree.push({
            id,
            name: dirent.name,
            icon: icon, // add the icon data URL
            children: dirent.isDirectory() ? await readDirectory(fullPath, id) : [],
        });
    }
    console.log("returning directory tree", JSON.stringify(directoryTree, null, 2));

    return directoryTree;
};

const getAccountsDirectoryData = async () => {
    console.log("getAccountsDirectoryData");
    let directoryData = await readDirectory(ACCOUNTS_DIR);
    return directoryData;
};

// starts watching the accounts directory for changes
export const startWatchingAccountsDirectory = (win) => {
    if (!fs.existsSync(ACCOUNTS_DIR)) {
        fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    }

    if (_accountsDirectoryWatcher) _accountsDirectoryWatcher.close();
    _accountsDirectoryWatcher = fs.watch(ACCOUNTS_DIR, { recursive: true }, () => {
        win.webContents.send("accounts-directory-changed");
    });

    return true;
};

export const stopWatchingAccountsDirectory = () => {
    if (_accountsDirectoryWatcher) _accountsDirectoryWatcher.close();
    _accountsDirectoryWatcher = null;
};

export function setupAccountHandlers() {
    ipcMain.handle("get-accounts", (event) => {
        const accounts = getAccounts();
        return accounts;
    });

    ipcMain.handle("create-account", async (event, name, password, picture) => {
        return await createAccount(name, password, picture);
    });

    ipcMain.handle("login", async (event, name, password) => {
        return await login(name, password);
    });

    ipcMain.handle("get-accounts-directory-data", async (event) => {
        return await getAccountsDirectoryData();
    });
}

module.exports = { setupAccountHandlers, startWatchingAccountsDirectory, stopWatchingAccountsDirectory };
