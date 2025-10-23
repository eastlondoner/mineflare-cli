#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Git Release Tool ===${NC}\n"

# Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is not installed${NC}"
    exit 1
fi

# Check if jq is available (needed for CI monitoring)
jq_available=true
if ! command -v jq &> /dev/null; then
    jq_available=false
    echo -e "${YELLOW}Warning: jq is not installed. CI monitoring will have limited functionality.${NC}"
    echo -e "Install jq for full features: ${BLUE}https://stedolan.github.io/jq/download/${NC}\n"
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    echo "Files with changes:"
    git status --short
    echo
    read -p "Do you want to commit these changes first? (y/n): " commit_changes
    
    if [ "$commit_changes" = "y" ] || [ "$commit_changes" = "Y" ]; then
        read -p "Enter commit message: " commit_msg
        git add .
        git commit -m "$commit_msg"
        echo -e "${GREEN}Changes committed${NC}\n"
    else
        echo -e "${YELLOW}Proceeding without committing changes...${NC}\n"
    fi
fi

# Get the latest tag
latest_tag=$(git describe --tags --abbrev=0 2>/dev/null)

if [ -z "$latest_tag" ]; then
    echo -e "${YELLOW}No existing tags found. Starting with v0.0.0${NC}"
    current_major=0
    current_minor=0
    current_patch=0
else
    echo -e "Current latest tag: ${GREEN}$latest_tag${NC}"
    
    # Parse version from tag (assuming format vX.Y.Z)
    version=${latest_tag#v}
    IFS='.' read -r current_major current_minor current_patch <<< "$version"
    
    # Handle missing parts
    current_major=${current_major:-0}
    current_minor=${current_minor:-0}
    current_patch=${current_patch:-0}
fi

echo -e "Current version: ${BLUE}$current_major.$current_minor.$current_patch${NC}\n"

# Ask what type of release
echo "What type of release is this?"
echo "  1) Patch (bug fixes)     - v$current_major.$current_minor.$((current_patch + 1))"
echo "  2) Minor (new features)  - v$current_major.$((current_minor + 1)).0"
echo "  3) Major (breaking changes) - v$((current_major + 1)).0.0"
echo "  4) Custom version"
echo "  5) Cancel"
echo

read -p "Select option (1-5): " release_type

case $release_type in
    1)
        new_major=$current_major
        new_minor=$current_minor
        new_patch=$((current_patch + 1))
        ;;
    2)
        new_major=$current_major
        new_minor=$((current_minor + 1))
        new_patch=0
        ;;
    3)
        new_major=$((current_major + 1))
        new_minor=0
        new_patch=0
        ;;
    4)
        read -p "Enter custom version (e.g., 1.2.3): " custom_version
        IFS='.' read -r new_major new_minor new_patch <<< "$custom_version"
        ;;
    5)
        echo -e "${YELLOW}Release cancelled${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

new_version="$new_major.$new_minor.$new_patch"
new_tag="v$new_version"

echo -e "\n${BLUE}New version will be: ${GREEN}$new_tag${NC}"

# Update package.json if it exists
if [ -f "package.json" ]; then
    echo
    read -p "Update version in package.json to $new_version? (y/n): " update_package
    
    if [ "$update_package" = "y" ] || [ "$update_package" = "Y" ]; then
        # Use a temporary file to preserve formatting
        if command -v jq &> /dev/null; then
            jq ".version = \"$new_version\"" package.json > package.json.tmp && mv package.json.tmp package.json
            echo -e "${GREEN}Updated package.json${NC}"
        else
            # Fallback to sed if jq is not available
            sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" package.json
            rm -f package.json.bak
            echo -e "${GREEN}Updated package.json (using sed)${NC}"
        fi
        
        git add package.json
        git commit -m "Bump version to $new_version"
        echo -e "${GREEN}Committed version bump${NC}"
    fi
fi

# Ask for release notes
echo
echo "Enter release notes (optional, press Enter for default):"
read -p "> " release_notes

if [ -z "$release_notes" ]; then
    release_notes="Release $new_tag"
fi

# Create the tag
echo -e "\n${BLUE}Creating tag $new_tag...${NC}"
git tag -a "$new_tag" -m "$release_notes"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Tag created successfully${NC}"
else
    echo -e "${RED}Failed to create tag${NC}"
    exit 1
fi

# Ask which remote to push to
remotes=$(git remote)
remote_count=$(echo "$remotes" | wc -l)

if [ -z "$remotes" ]; then
    echo -e "${RED}No remote repositories configured${NC}"
    exit 1
elif [ "$remote_count" -eq 1 ]; then
    remote="$remotes"
    echo -e "\n${BLUE}Found remote: $remote${NC}"
else
    echo -e "\n${BLUE}Multiple remotes found:${NC}"
    echo "$remotes"
    read -p "Enter remote name (default: origin): " remote
    remote=${remote:-origin}
fi

# Ask which branch to push
current_branch=$(git branch --show-current)
echo -e "${BLUE}Current branch: $current_branch${NC}"
read -p "Push to this branch? (y/n): " push_current

if [ "$push_current" = "y" ] || [ "$push_current" = "Y" ]; then
    branch=$current_branch
else
    read -p "Enter branch name: " branch
fi

# Confirm before pushing
echo
echo -e "${YELLOW}Ready to push:${NC}"
echo "  - Remote: $remote"
echo "  - Branch: $branch"
echo "  - Tag: $new_tag"
echo
read -p "Proceed with push? (y/n): " confirm_push

if [ "$confirm_push" != "y" ] && [ "$confirm_push" != "Y" ]; then
    echo -e "${YELLOW}Push cancelled. Tag $new_tag was created locally.${NC}"
    echo "You can push manually with:"
    echo "  git push $remote $branch"
    echo "  git push $remote $new_tag"
    exit 0
fi

# Push the branch
echo -e "\n${BLUE}Pushing branch to $remote/$branch...${NC}"
git push $remote $branch

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Branch pushed successfully${NC}"
else
    echo -e "${RED}Failed to push branch${NC}"
    exit 1
fi

# Push the tag
echo -e "\n${BLUE}Pushing tag $new_tag to $remote...${NC}"
git push $remote $new_tag

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Tag pushed successfully${NC}"
else
    echo -e "${RED}Failed to push tag${NC}"
    exit 1
fi

echo -e "\n${GREEN}✓ Release $new_tag pushed successfully!${NC}"

# If gh CLI is available, monitor CI and handle release
if command -v gh &> /dev/null; then
    echo -e "\n${BLUE}=== GitHub Actions CI Monitoring ===${NC}"
    
    # Wait a moment for workflows to be triggered
    echo "Waiting for CI workflows to start..."
    sleep 5
    
    # Get the list of workflow runs for this commit
    commit_sha=$(git rev-parse HEAD)
    echo -e "Monitoring workflows for commit: ${YELLOW}${commit_sha:0:7}${NC}"
    
    # Function to check all workflow statuses
    check_workflows() {
        local all_success=true
        local any_running=false
        local any_failed=false
        
        # Get all workflow runs for this commit
        workflow_runs=$(gh run list --commit "$commit_sha" --json databaseId,name,status,conclusion,workflowName --limit 10)
        
        if [ -z "$workflow_runs" ] || [ "$workflow_runs" = "[]" ]; then
            echo -e "${YELLOW}No workflows found for this commit yet...${NC}"
            return 2  # No workflows found
        fi
        
        echo -e "\n${BLUE}Workflow Status:${NC}"
        if [ "$jq_available" = true ]; then
            echo "$workflow_runs" | jq -r '.[] | "\(.workflowName): \(.status) \(if .conclusion then "(\(.conclusion))" else "" end)"' | while IFS= read -r line; do
                if [[ $line == *"completed"* ]]; then
                    if [[ $line == *"success"* ]]; then
                        echo -e "  ${GREEN}✓ $line${NC}"
                    elif [[ $line == *"failure"* ]] || [[ $line == *"cancelled"* ]]; then
                        echo -e "  ${RED}✗ $line${NC}"
                    else
                        echo -e "  ${YELLOW}⚠ $line${NC}"
                    fi
                else
                    echo -e "  ${YELLOW}⏳ $line${NC}"
                fi
            done
            
            # Check the actual status of each workflow
            echo "$workflow_runs" | jq -r '.[] | "\(.status)|\(.conclusion)"' | while IFS='|' read -r status conclusion; do
                if [ "$status" != "completed" ]; then
                    any_running=true
                elif [ "$conclusion" != "success" ] && [ "$conclusion" != "skipped" ]; then
                    any_failed=true
                    all_success=false
                fi
            done
        else
            # Fallback when jq is not available - use gh run list
            echo "  Checking workflow status (limited view without jq)..."
            
            # Use gh to check status directly
            if gh run list --commit "$commit_sha" --limit 10 | grep -q "in_progress\|queued"; then
                any_running=true
            fi
            
            if gh run list --commit "$commit_sha" --limit 10 | grep -q "failure\|cancelled"; then
                any_failed=true
                all_success=false
            fi
        fi
        
        if $any_running; then
            return 1  # Still running
        elif $any_failed; then
            return 3  # Failed
        else
            return 0  # All success
        fi
    }
    
    # Poll for workflow completion
    max_wait_time=1800  # 30 minutes max
    poll_interval=15     # Check every 15 seconds
    elapsed_time=0
    
    echo -e "\n${BLUE}Monitoring CI workflows (max wait: ${max_wait_time}s)...${NC}"
    echo "Press Ctrl+C to skip CI monitoring and continue"
    
    while [ $elapsed_time -lt $max_wait_time ]; do
        check_workflows
        result=$?
        
        if [ $result -eq 0 ]; then
            echo -e "\n${GREEN}✓ All CI workflows completed successfully!${NC}"
            ci_passed=true
            break
        elif [ $result -eq 3 ]; then
            echo -e "\n${RED}✗ One or more CI workflows failed${NC}"
            ci_passed=false
            break
        elif [ $result -eq 2 ]; then
            # No workflows found yet
            echo -ne "\r${YELLOW}Waiting for workflows to start... (${elapsed_time}s)${NC}"
        else
            # Still running
            echo -ne "\r${YELLOW}Workflows still running... (${elapsed_time}s)${NC}"
        fi
        
        sleep $poll_interval
        elapsed_time=$((elapsed_time + poll_interval))
    done
    
    if [ $elapsed_time -ge $max_wait_time ]; then
        echo -e "\n${YELLOW}⚠ Timeout waiting for CI workflows${NC}"
        ci_passed=false
    fi
    
    # Handle release creation based on CI status
    echo
    if [ "$ci_passed" = true ]; then
        echo -e "${GREEN}CI passed!${NC} Ready to create a GitHub release."
        read -p "Create and publish a GitHub release? (y/n): " create_release
    else
        echo -e "${YELLOW}CI did not pass or timed out.${NC}"
        read -p "Create a DRAFT GitHub release anyway? (y/n): " create_release
    fi
    
    if [ "$create_release" = "y" ] || [ "$create_release" = "Y" ]; then
        echo "Creating GitHub release..."
        
        # Determine if release should be draft
        if [ "$ci_passed" = true ]; then
            draft_flag=""
            prerelease_flag=""
        else
            draft_flag="--draft"
            prerelease_flag=""
            echo -e "${YELLOW}Creating as draft release since CI didn't pass${NC}"
        fi
        
        # Create the release
        if [ -f "CHANGELOG.md" ]; then
            read -p "Generate release notes from CHANGELOG.md? (y/n): " use_changelog
            if [ "$use_changelog" = "y" ] || [ "$use_changelog" = "Y" ]; then
                gh release create "$new_tag" --title "$new_tag" --notes-file CHANGELOG.md $draft_flag $prerelease_flag
            else
                gh release create "$new_tag" --title "$new_tag" --notes "$release_notes" $draft_flag $prerelease_flag
            fi
        else
            # Try to auto-generate release notes
            read -p "Auto-generate release notes from commits? (y/n): " auto_notes
            if [ "$auto_notes" = "y" ] || [ "$auto_notes" = "Y" ]; then
                gh release create "$new_tag" --title "$new_tag" --generate-notes $draft_flag $prerelease_flag
            else
                gh release create "$new_tag" --title "$new_tag" --notes "$release_notes" $draft_flag $prerelease_flag
            fi
        fi
        
        if [ $? -eq 0 ]; then
            if [ "$ci_passed" = true ]; then
                echo -e "${GREEN}✓ GitHub release published successfully!${NC}"
                echo -e "View at: ${BLUE}https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$new_tag${NC}"
            else
                echo -e "${YELLOW}✓ GitHub draft release created${NC}"
                echo "You can publish it manually after CI passes at:"
                echo -e "${BLUE}https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases${NC}"
            fi
        else
            echo -e "${YELLOW}Failed to create GitHub release${NC}"
        fi
    fi
else
    echo -e "\n${YELLOW}gh CLI not found. Install it to enable CI monitoring and GitHub releases.${NC}"
    echo "Visit: https://cli.github.com/manual/installation"
fi

echo -e "\n${BLUE}=== Done ===${NC}"