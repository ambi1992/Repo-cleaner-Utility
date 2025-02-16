const { execSync } = require('child_process');
const moment = require('moment');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

// Set the number of months after which branches should be deleted (12 months)
const MAX_AGE_MONTHS = 12;

// Helper function to run shell commands
function runCommand(command, cwd = '.') {
    try {
        return execSync(command, { encoding: 'utf8', cwd });
    } catch (error) {
        console.error(`Error executing command in ${cwd}: ${error}`);
        return null;
    }
}

// Get all remote branches
function getBranches(cwd) {
    const branches = runCommand('git branch -r', cwd);
    return branches ? branches.split('\n').map(branch => branch.trim()).filter(Boolean) : [];
}

// Get the last commit date for a branch
function getLastCommitDate(branch, cwd) {
    const command = `git log -1 --format=%ci origin/${branch}`;
    const result = runCommand(command, cwd);
    return result ? moment(result.trim()) : null;
}

// Delete a branch
function deleteBranch(branch, cwd) {
    const command = `git push origin --delete ${branch}`;
    console.log(`Deleting branch: ${branch}`);
    runCommand(command, cwd);
}

// Get stale branches
function getStaleBranches(cwd) {
    const branches = getBranches(cwd);
    const staleBranches = [];

    branches.forEach(branch => {
        if (branch.includes('origin/')) {
            const branchName = branch.replace('origin/', '');
            const lastCommitDate = getLastCommitDate(branchName, cwd);

            // Check if the branch is older than the MAX_AGE_MONTHS
            if (lastCommitDate && lastCommitDate.isBefore(moment().subtract(MAX_AGE_MONTHS, 'months'))) {
                staleBranches.push(branchName);
            }
        }
    });

    return staleBranches;
}

// Prompt user to approve or reject the deletion of each stale branch
async function promptUserForApproval(staleBranches) {
    const questions = staleBranches.map(branch => ({
        type: 'confirm',
        name: branch,
        message: `Do you want to delete the branch '${branch}'?`,
        default: false
    }));

    const answers = await inquirer.prompt(questions);
    return Object.keys(answers).filter(branch => answers[branch]);
}

// Main function to handle repo cleanup
async function cleanOldBranches(repoDir) {
    const staleBranches = getStaleBranches(repoDir);

    if (staleBranches.length === 0) {
        console.log('No stale branches found.');
        return;
    }

    console.log(`Found ${staleBranches.length} stale branches older than ${MAX_AGE_MONTHS} months:`);

    // Show the list of stale branches
    staleBranches.forEach((branch, index) => {
        console.log(`${index + 1}. ${branch}`);
    });

    // Prompt the user for approval to delete each stale branch
    const branchesToDelete = await promptUserForApproval(staleBranches);

    if (branchesToDelete.length === 0) {
        console.log('No branches selected for deletion.');
        return;
    }

    // Delete the approved branches
    for (const branch of branchesToDelete) {
        deleteBranch(branch, repoDir);
    }

    console.log('Branch cleanup completed.');
}

// Main function to read the list of repositories from the file and process each one
async function processRepos() {
    console.log('\nPrint DirName:${__dirname}');
    const filePath = path.resolve(__dirname, 'masterRepolist.txt');

    if (!fs.existsSync(filePath)) {
        console.log('masterRepoList.txt file not found!');
        return;
    }

    const repoList = fs.readFileSync(filePath, 'utf8').split('\n').map(line => line.trim()).filter(line => line !== '');

    if (repoList.length === 0) {
        console.log('No repositories found in masterRepoList.txt');
        return;
    }

    // Process each repository
    for (const repo of repoList) {
        console.log(`\nProcessing repository: ${repo}`);

        // Check if it's a URL or a local path
        const repoDir = repo.startsWith('http') ? path.join(__dirname, path.basename(repo, '.git')) : repo;

        // Clone the repo if it's a URL and it doesn't exist
        if (repo.startsWith('http') && !fs.existsSync(repoDir)) {
            console.log(`Cloning repository: ${repo}`);
            runCommand(`git clone ${repo}`, __dirname);
        }

        // Perform cleanup for the repository
        await cleanOldBranches(repoDir);
    }
}

// Run the repo cleanup process
processRepos();
