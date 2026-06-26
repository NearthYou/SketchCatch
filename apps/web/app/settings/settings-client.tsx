"use client";

import { useState } from "react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";

export function SettingsClient() {
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [isAwsConnected, setIsAwsConnected] = useState(false);
  const [roleArn, setRoleArn] = useState("");

  return (
    <>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Settings</p>
          <h1>환경설정</h1>
        </div>
      </div>

      <div className="settingsGrid">
        <section className="dashboardPanel integrationPanel" aria-labelledby="github-settings-title">
          <div className="integrationHeader">
            <span className="integrationIcon">
              <DashboardIcon name="github" />
            </span>
            <div>
              <p className="dashboardPanelKicker">GitHub</p>
              <h2 id="github-settings-title">GitHub 계정 연동</h2>
            </div>
          </div>
          <p>Terraform export와 저장소 저장을 위해 GitHub 계정을 연결합니다.</p>
          <div className="integrationStatus">
            <span className={isGithubConnected ? "statusDot statusDotConnected" : "statusDot"} />
            {isGithubConnected ? "연동됨" : "연동 전"}
          </div>
          <button
            className="dashboardTopbarAction"
            onClick={() => setIsGithubConnected((current) => !current)}
            type="button"
          >
            <DashboardIcon name={isGithubConnected ? "check" : "link"} />
            <span>{isGithubConnected ? "연동 해제" : "GitHub 연동"}</span>
          </button>
        </section>

        <section className="dashboardPanel integrationPanel" aria-labelledby="aws-settings-title">
          <div className="integrationHeader">
            <span className="integrationIcon integrationIconAws">
              <DashboardIcon name="cloud" />
            </span>
            <div>
              <p className="dashboardPanelKicker">AWS</p>
              <h2 id="aws-settings-title">AWS 계정 연동</h2>
            </div>
          </div>
          <p>실제 배포 단계에서는 백엔드에서 검증된 IAM Role 기준으로 연결합니다.</p>
          <label className="settingsField">
            AWS Role ARN
            <input
              onChange={(event) => setRoleArn(event.target.value)}
              placeholder="arn:aws:iam::123456789012:role/SketchCatchDeployRole"
              value={roleArn}
            />
          </label>
          <div className="integrationStatus">
            <span className={isAwsConnected ? "statusDot statusDotConnected" : "statusDot"} />
            {isAwsConnected ? "연동됨" : "연동 전"}
          </div>
          <button
            className="dashboardTopbarAction"
            disabled={!isAwsConnected && roleArn.trim().length === 0}
            onClick={() => setIsAwsConnected((current) => !current)}
            type="button"
          >
            <DashboardIcon name={isAwsConnected ? "check" : "link"} />
            <span>{isAwsConnected ? "AWS 연동 해제" : "AWS 연동"}</span>
          </button>
        </section>
      </div>
    </>
  );
}
