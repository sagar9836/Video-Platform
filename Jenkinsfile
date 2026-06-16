pipeline {
    agent any

    environment {
        BACKEND_IMAGE  = "9836sagar9836/video-api"
        FRONTEND_IMAGE = "9836sagar9836/video-frontend"
        FFMPEG_IMAGE   = "9836sagar9836/video-ffmpeg"

        TAG = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout Code') {
            steps {
                git branch: 'main',
                url: 'https://github.com/sagar9836/Video-Platform.git'
            }
        }

        stage('Build Docker Images') {
            steps {
                sh '''
                    docker build -t $BACKEND_IMAGE:$TAG ./backend
                    docker build -t $FRONTEND_IMAGE:$TAG ./frontend
                    docker build -t $FFMPEG_IMAGE:$TAG ./backend/ffmpeg_service
                '''
            }
        }

        stage('Push Docker Images') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )
                ]) {
                    sh '''
                        echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin

                        docker push $BACKEND_IMAGE:$TAG
                        docker push $FRONTEND_IMAGE:$TAG
                        docker push $FFMPEG_IMAGE:$TAG
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                withCredentials([
                    file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')
                ]) {
                    sh '''
                        kubectl set image deployment/api \
                        api=$BACKEND_IMAGE:$TAG \
                        -n video-platform

                        kubectl set image deployment/frontend \
                        frontend=$FRONTEND_IMAGE:$TAG \
                        -n video-platform

                        kubectl set image deployment/ffmpeg-worker \
                        ffmpeg=$FFMPEG_IMAGE:$TAG \
                        -n video-platform

                        kubectl rollout status deployment/api -n video-platform
                        kubectl rollout status deployment/frontend -n video-platform
                        kubectl rollout status deployment/ffmpeg-worker -n video-platform
                    '''
                }
            }
        }
    }
}
