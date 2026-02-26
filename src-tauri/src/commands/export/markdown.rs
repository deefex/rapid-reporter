use crate::models::Note;

/// Counts icon-backed note types used in the summary section.
///
/// Returns counts in this order:
/// `(bug, idea, observation, question, warning)`.
fn summary_counts(notes: &[Note]) -> (usize, usize, usize, usize, usize) {
    let mut bug_count = 0usize;
    let mut idea_count = 0usize;
    let mut observation_count = 0usize;
    let mut question_count = 0usize;
    let mut warning_count = 0usize;

    for note in notes {
        match note.note_type.to_lowercase().as_str() {
            "bug" => bug_count += 1,
            "idea" => idea_count += 1,
            "observation" => observation_count += 1,
            "question" => question_count += 1,
            "warning" => warning_count += 1,
            _ => {}
        }
    }

    (
        bug_count,
        idea_count,
        observation_count,
        question_count,
        warning_count,
    )
}

/// Formats a count label with singular/plural forms.
fn plural(count: usize, singular: &str, plural: &str) -> String {
    if count == 1 {
        format!("{} {}", count, singular)
    } else {
        format!("{} {}", count, plural)
    }
}

/// Builds the optional `## Summary` markdown section for icon-backed note types.
pub(crate) fn build_summary_section(notes: &[Note]) -> Option<String> {
    let (bug_count, idea_count, observation_count, question_count, warning_count) =
        summary_counts(notes);

    let has_summary = bug_count > 0
        || idea_count > 0
        || observation_count > 0
        || question_count > 0
        || warning_count > 0;

    if !has_summary {
        return None;
    }

    let mut md = String::new();
    md.push_str("## Summary\n\n");

    if bug_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/bug.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(bug_count, "Bug", "Bugs")
        ));
    }

    if idea_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/idea.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(idea_count, "Idea", "Ideas")
        ));
    }

    if observation_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/observation.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(observation_count, "Observation", "Observations")
        ));
    }

    if question_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/question.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(question_count, "Question", "Questions")
        ));
    }

    if warning_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/warning.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(warning_count, "Warning", "Warnings")
        ));
    }

    Some(md)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(note_type: &str, text: &str) -> Note {
        Note {
            note_type: note_type.to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn summary_counts_only_icon_types() {
        let notes = vec![
            note("bug", "b1"),
            note("bug", "b2"),
            note("idea", "i1"),
            note("test", "t1"),
            note("screenshot", "/tmp/x.png"),
            note("warning", "w1"),
        ];

        let (bug, idea, obs, q, warn) = summary_counts(&notes);
        assert_eq!(bug, 2);
        assert_eq!(idea, 1);
        assert_eq!(obs, 0);
        assert_eq!(q, 0);
        assert_eq!(warn, 1);
    }

    #[test]
    fn build_summary_section_is_none_when_no_icon_notes() {
        let notes = vec![
            note("test", "some test note"),
            note("snippet", "let x = 1;"),
            note("screenshot", "/tmp/x.png"),
        ];

        assert!(build_summary_section(&notes).is_none());
    }

    #[test]
    fn build_summary_section_includes_only_present_types_and_pluralises() {
        let notes = vec![
            note("bug", "b1"),
            note("bug", "b2"),
            note("idea", "i1"),
            note("question", "q1"),
            note("warning", "w1"),
            note("warning", "w2"),
            note("warning", "w3"),
        ];

        let md = build_summary_section(&notes).expect("summary should exist");
        assert!(md.contains("## Summary"));
        assert!(md.contains("assets/icons/bug.png"));
        assert!(md.contains("2 Bugs"));
        assert!(md.contains("assets/icons/idea.png"));
        assert!(md.contains("1 Idea"));
        assert!(md.contains("assets/icons/question.png"));
        assert!(md.contains("1 Question"));
        assert!(md.contains("assets/icons/warning.png"));
        assert!(md.contains("3 Warnings"));
        assert!(!md.contains("assets/icons/observation.png"));
    }

    #[test]
    fn summary_is_case_insensitive() {
        let notes = vec![
            note("Bug", "b1"),
            note("BUG", "b2"),
            note("Idea", "i1"),
            note("WARNING", "w1"),
        ];

        let (bug, idea, obs, q, warn) = summary_counts(&notes);

        assert_eq!(bug, 2);
        assert_eq!(idea, 1);
        assert_eq!(obs, 0);
        assert_eq!(q, 0);
        assert_eq!(warn, 1);

        let md = build_summary_section(&notes).expect("summary should exist");
        assert!(md.contains("2 Bugs"));
        assert!(md.contains("1 Idea"));
        assert!(md.contains("1 Warning"));
    }
}
