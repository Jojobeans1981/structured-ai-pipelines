# ──────────────────────────────────────────────────────────────
# Validation Agent – multi-language code validation container
# ──────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

LABEL maintainer="Gauntlet Forge" \
      description="Software-factory validation agent – lint, test, coverage, security"

# ── 1. System packages ────────────────────────────────────────
# Java (headless JDK 17 + Maven), Node 20.x, Go 1.21, .NET 7, git, utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
        # core utilities
        git curl wget unzip ca-certificates gnupg \
        # Java / Maven
        default-jdk-headless maven \
        # build essentials (needed by some npm native modules)
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 LTS via NodeSource ─────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Go 1.21 ───────────────────────────────────────────────────
ENV GOLANG_VERSION=1.21.13
RUN wget -q "https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}" \
    GOPATH="/root/go"

# ── .NET SDK 7 ─────────────────────────────────────────────────
RUN wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 7.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh
ENV DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

# ── 2. Language-specific CLI tools ────────────────────────────

# Python tools (pinned)
RUN pip install --no-cache-dir \
        flake8==6.1.0 \
        black==23.12.1 \
        coverage==7.4.0 \
        bandit==1.7.7 \
        PyYAML==6.0.1 \
        pytest==7.4.4

# Node tools (pinned major)
RUN npm install -g \
        eslint@8 \
        jest@29 \
        nyc@15

# Go tools
RUN go install golang.org/x/lint/golint@latest \
    && go install golang.org/x/vuln/cmd/govulncheck@latest

# .NET tools
RUN dotnet tool install -g dotnet-format || true \
    && dotnet tool install -g dotnet-coverage || true
ENV PATH="${PATH}:/root/.dotnet/tools"

# ── 3. Application code ──────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.yaml .
COPY src/ src/

# ── 4. Non-root user ─────────────────────────────────────────
RUN useradd --create-home --shell /bin/bash validator \
    && chown -R validator:validator /app

# Copy Go binaries and .NET tools to validator-accessible paths
RUN cp -r /root/go/bin/* /usr/local/bin/ 2>/dev/null || true \
    && cp -r /root/.dotnet/tools/* /usr/local/bin/ 2>/dev/null || true

USER validator
ENV PATH="/usr/local/bin:/usr/local/go/bin:/usr/share/dotnet:${PATH}" \
    GOPATH="/home/validator/go"

# ── 5. Entrypoint ────────────────────────────────────────────
ENTRYPOINT ["python", "-m", "src.validation_agent.agent"]
