#!/bin/bash
# Usage: ./anchor-bootstrap.sh <project-name>

PROJECT=$1

if [ -z "$PROJECT" ]; then
  echo "❌ Please provide a project name."
  echo "Usage: ./anchor-bootstrap.sh <project-name>"
  exit 1
fi

# Initialize Anchor project
anchor init $PROJECT

# Navigate into project src folder
cd $PROJECT/programs/$PROJECT/src

# Create folders and files
mkdir state instructions
touch state/mod.rs
touch instructions/mod.rs
touch errors.rs constants.rs

read -p "Do you want to open VS Code? (y/n): " VS_CODE_OPEN

if [[ "$VS_CODE_OPEN" == "y" || "$VS_CODE_OPEN" == "Y" ]]; then
 cd ../../..
 code .
else
  echo "Exit"
fi

