"use client";

import { type FormEvent, useState } from "react";
import {
  type CloudService,
  cloudServiceOptions,
  ownedTemplates,
  type OwnedTemplate
} from "../../components/dashboard/dashboard-data";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { listBoardTemplates } from "../../features/resource-settings/template-library";

type TemplateFormState = {
  readonly title: string;
  readonly description: string;
  readonly cloudServices: readonly CloudService[];
};

const emptyForm: TemplateFormState = {
  cloudServices: ["AWS"],
  description: "",
  title: ""
};

export function TemplatesClient() {
  const templates = listBoardTemplates();
  const [myTemplates, setMyTemplates] = useState<readonly OwnedTemplate[]>(ownedTemplates);
  const [formState, setFormState] = useState<TemplateFormState>(emptyForm);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggleCloudService(service: CloudService): void {
    setFormState((current) => {
      const hasService = current.cloudServices.includes(service);
      const nextServices = hasService
        ? current.cloudServices.filter((selected) => selected !== service)
        : [...current.cloudServices, service];

      return {
        ...current,
        cloudServices: nextServices.length > 0 ? nextServices : current.cloudServices
      };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMessage(null);

    if (formState.title.trim().length === 0 || formState.description.trim().length === 0) {
      setMessage("제목과 설명을 입력해야 템플릿을 등록할 수 있습니다.");
      return;
    }

    if (editingTemplateId) {
      setMyTemplates((current) =>
        current.map((template) =>
          template.id === editingTemplateId
            ? {
                ...template,
                cloudServices: formState.cloudServices,
                description: formState.description.trim(),
                title: formState.title.trim(),
                updatedLabel: "방금 수정"
              }
            : template
        )
      );
      setEditingTemplateId(null);
      setMessage("템플릿을 수정했습니다.");
    } else {
      const nextTemplate: OwnedTemplate = {
        cloudServices: formState.cloudServices,
        description: formState.description.trim(),
        id: `owned-template-${Date.now()}`,
        title: formState.title.trim(),
        updatedLabel: "방금 등록"
      };

      setMyTemplates((current) => [nextTemplate, ...current]);
      setMessage("템플릿을 등록했습니다.");
    }

    setFormState(emptyForm);
  }

  function startEditing(template: OwnedTemplate): void {
    setEditingTemplateId(template.id);
    setFormState({
      cloudServices: template.cloudServices,
      description: template.description,
      title: template.title
    });
    setMessage(null);
  }

  function cancelEditing(): void {
    setEditingTemplateId(null);
    setFormState(emptyForm);
    setMessage(null);
  }

  function deleteTemplate(templateId: string): void {
    setMyTemplates((current) => current.filter((template) => template.id !== templateId));

    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
      setFormState(emptyForm);
    }

    setMessage("템플릿을 삭제했습니다.");
  }

  return (
    <>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Template library</p>
          <h1>템플릿 보관함</h1>
        </div>
      </div>

      {message ? (
        <p className="dashboardMessage" role="status">
          {message}
        </p>
      ) : null}

      <section className="dashboardPanel" aria-labelledby="board-template-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Board templates</p>
            <h2 id="board-template-title">보드에서 바로 쓰는 템플릿</h2>
          </div>
          <span className="dashboardCountBadge">{templates.length}개</span>
        </div>

        <div className="templateGrid">
          {templates.map((template) => (
            <article className="templateCard" key={template.id}>
              <div className="templateCardHeader">
                <div>
                  <span>{template.tags.join(" · ")}</span>
                  <h3>{template.title}</h3>
                </div>
                <strong>{template.diagramJson.nodes.length}개 리소스</strong>
              </div>
              <p>{template.description}</p>
              <div className="dashboardChipRow">
                {template.tags.map((tag) => (
                  <span className="dashboardChip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="templateCardActions">
                <a className="dashboardSecondaryButton" href="/workspace">
                  <DashboardIcon name="layers" />
                  <span>보드에서 사용</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboardTwoColumn">
        <section className="dashboardPanel" aria-labelledby="template-form-title">
          <div className="dashboardPanelHeader">
            <div>
              <p className="dashboardPanelKicker">My templates</p>
              <h2 id="template-form-title">
                {editingTemplateId ? "내 템플릿 수정" : "내 템플릿 등록"}
              </h2>
            </div>
          </div>

          <form className="templateForm" onSubmit={handleSubmit}>
            <label>
              제목
              <input
                onChange={(event) =>
                  setFormState((current) => ({ ...current, title: event.target.value }))
                }
                value={formState.title}
              />
            </label>
            <label>
              설명
              <textarea
                onChange={(event) =>
                  setFormState((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                value={formState.description}
              />
            </label>
            <fieldset>
              <legend>클라우드 서비스</legend>
              <div className="templateServiceOptions">
                {cloudServiceOptions.map((service) => (
                  <label key={service}>
                    <input
                      checked={formState.cloudServices.includes(service)}
                      onChange={() => toggleCloudService(service)}
                      type="checkbox"
                    />
                    <span>{service}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="templateRowActions">
              <button className="dashboardTopbarAction" type="submit">
                <DashboardIcon name={editingTemplateId ? "edit" : "plus"} />
                <span>{editingTemplateId ? "수정 완료" : "등록"}</span>
              </button>
              {editingTemplateId ? (
                <button className="dashboardSecondaryButton" onClick={cancelEditing} type="button">
                  <DashboardIcon name="close" />
                  <span>취소</span>
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="dashboardPanel" aria-labelledby="owned-template-title">
          <div className="dashboardPanelHeader">
            <div>
              <p className="dashboardPanelKicker">Owned</p>
              <h2 id="owned-template-title">내가 만든 템플릿</h2>
            </div>
            <span className="dashboardCountBadge">{myTemplates.length}개</span>
          </div>
          <div className="templateList">
            {myTemplates.map((template) => (
              <div className="templateListRow" key={template.id}>
                <div>
                  <strong>{template.title}</strong>
                  <span>{template.updatedLabel}</span>
                  <p>{template.description}</p>
                </div>
                <div className="templateRowActions">
                  <button className="dashboardSecondaryButton" onClick={() => startEditing(template)} type="button">
                    <DashboardIcon name="edit" />
                    <span>수정</span>
                  </button>
                  <button className="dashboardDangerButton" onClick={() => deleteTemplate(template.id)} type="button">
                    <DashboardIcon name="trash" />
                    <span>삭제</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
