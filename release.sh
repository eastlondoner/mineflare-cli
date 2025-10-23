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

echo -e "\n${GREEN}✓ Release $new_tag completed successfully!${NC}"

# If gh CLI is available, offer to create a GitHub release
if command -v gh &> /dev/null; then
    echo
    read -p "Create a GitHub release with gh CLI? (y/n): " create_release
    
    if [ "$create_release" = "y" ] || [ "$create_release" = "Y" ]; then
        echo "Creating GitHub release..."
        
        # Check if release notes file exists
        if [ -f "CHANGELOG.md" ]; then
            read -p "Generate release notes from CHANGELOG.md? (y/n): " use_changelog
            if [ "$use_changelog" = "y" ] || [ "$use_changelog" = "Y" ]; then
                gh release create "$new_tag" --title "$new_tag" --notes-file CHANGELOG.md
            else
                gh release create "$new_tag" --title "$new_tag" --notes "$release_notes"
            fi
        else
            gh release create "$new_tag" --title "$new_tag" --notes "$release_notes"
        fi
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}GitHub release created successfully${NC}"
        else
            echo -e "${YELLOW}Failed to create GitHub release${NC}"
        fi
    fi
fi

echo -e "\n${BLUE}=== Done ===${NC}"